import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from selenium import webdriver
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.common.by import By
from selenium.common.exceptions import TimeoutException

ARCHIVE_DIR = Path("archive")

# NYT rolls the puzzle over at midnight in the browser's local timezone, so we
# emulate a far-eastern zone to grab each puzzle as soon as it is published.
#
# Careful: Etc/GMT zone names carry POSIX-inverted signs, so "Etc/GMT-12" is
# UTC+12 (a first-to-roll-over zone), NOT UTC-12. That inversion is intentional
# here -- do not "correct" the sign. Paired with the 12:10 UTC cron in
# .github/workflows/scrape.yaml, this lands at 00:10 local: a 10-minute buffer
# after rollover. Files are keyed by that same local date.
TZ_EARLIEST = "Etc/GMT-12"


CARD_XPATH = "//input[@data-testid='card-input']"
PLAY_XPATH = "//button[@data-testid='moment-btn-play']"

# Written on failure and uploaded by the workflow, so a failed run can be
# diagnosed from what the page actually was rather than by guesswork.
DEBUG_DIR = Path("debug")


def _visible_cards(driver):
    """Wait condition: all 16 puzzle cards present and rendered, else falsy."""
    cards = driver.find_elements(By.XPATH, CARD_XPATH)
    if len(cards) == 16 and all(c.is_displayed() for c in cards):
        return cards
    return False


def _cards_in_iframes(driver):
    """Look for the board inside iframes, in case it moved into one.

    Only called once the top-level document has already come up empty, so it
    cannot affect a run that is working. If the cards are found, we stay
    switched into that frame -- the caller reads values from these elements.
    """
    try:
        frames = driver.find_elements(By.TAG_NAME, "iframe")
        for index in range(len(frames)):
            driver.switch_to.default_content()
            try:
                driver.switch_to.frame(
                    driver.find_elements(By.TAG_NAME, "iframe")[index]
                )
            except Exception:
                continue
            cards = driver.find_elements(By.XPATH, CARD_XPATH)
            if len(cards) == 16:
                return cards
        driver.switch_to.default_content()
    except Exception:
        # This is a long shot on the failure path; it must never replace the
        # real "board did not render" error with an error of its own.
        pass
    return None


def _describe_page(driver):
    """Summarise what the page actually is, for the failure message."""
    bits = []
    try:
        bits.append(f"url={driver.current_url}")
        bits.append(f"title={driver.title!r}")
        bits.append(f"iframes={len(driver.find_elements(By.TAG_NAME, 'iframe'))}")
        bits.append(f"play_buttons={len(driver.find_elements(By.XPATH, PLAY_XPATH))}")
        bits.append(
            "consent="
            f"{len(driver.find_elements(By.ID, 'fides-reject-all-button'))}"
        )
        # Any input at all tells us whether the board rendered under a
        # different attribute, versus not rendering at all.
        bits.append(f"inputs={len(driver.find_elements(By.TAG_NAME, 'input'))}")
        text = driver.find_element(By.TAG_NAME, "body").text
        bits.append(f"body_text={' '.join(text.split())[:300]!r}")
    except Exception as exc:  # diagnostics must never mask the real failure
        bits.append(f"<diagnostics incomplete: {exc}>")
    return " ".join(bits)


def _dump_debug_artifacts(driver):
    """Save a screenshot and the page HTML; return a note for the log."""
    try:
        DEBUG_DIR.mkdir(exist_ok=True)
        driver.save_screenshot(str(DEBUG_DIR / "failure.png"))
        (DEBUG_DIR / "failure.html").write_text(driver.page_source, encoding="utf-8")
        return f"wrote {DEBUG_DIR}/failure.png and {DEBUG_DIR}/failure.html"
    except Exception as exc:
        return f"could not write debug artifacts: {exc}"


def _open_board(driver, timeout=20):
    """Click play and return the 16 card inputs once the board has rendered.

    The board renders asynchronously, so the cards are not in the DOM yet when
    click() returns -- reading them immediately is a race. The click can also
    land before the handler is bound, in which case the board never opens and
    waiting alone cannot recover, so we re-click once before giving up.
    """
    play = WebDriverWait(driver, timeout=10).until(
        lambda d: d.find_element(By.XPATH, PLAY_XPATH)
    )
    play.click()

    for attempt in range(2):
        try:
            return WebDriverWait(driver, timeout=timeout).until(_visible_cards)
        except TimeoutException:
            if attempt == 0:
                try:
                    driver.find_element(By.XPATH, PLAY_XPATH).click()
                except Exception:
                    pass

    # Top-level document has no board. Before failing, check whether it moved
    # into an iframe.
    cards = _cards_in_iframes(driver)
    if cards:
        return cards

    found = len(driver.find_elements(By.XPATH, CARD_XPATH))
    raise Exception(
        f"Board did not render 16 cards after clicking play (found {found}). "
        f"Page state: {_describe_page(driver)}. {_dump_debug_artifacts(driver)}"
    )


def scrape_words():
    # Run in a first-to-roll-over timezone so we scrape shortly after publication

    options = webdriver.ChromeOptions()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument(f"--timezone={TZ_EARLIEST}")

    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(30)
    driver.execute_cdp_cmd("Emulation.setTimezoneOverride", {"timezoneId": TZ_EARLIEST})

    try:
        driver.get("https://www.nytimes.com/games/connections")

        try:
            reject_cookies = WebDriverWait(driver, timeout=10).until(
                lambda d: next(
                    (b for b in d.find_elements(By.ID, "fides-reject-all-button") if b.is_displayed()),
                    False,
                )
            )
            reject_cookies.click()
        except TimeoutException:
            pass

        words = _open_board(driver)

        word_values = [w.get_property("value").upper() for w in words]

        # Use earliest timezone so "today" is consistent and we scrape at the earliest moment
        puzzle_date = datetime.now(ZoneInfo(TZ_EARLIEST)).date().isoformat()
        data = {
            "date": puzzle_date,
            "words": word_values,
        }

        ARCHIVE_DIR.mkdir(exist_ok=True)
        out_path = ARCHIVE_DIR / f"{puzzle_date}.json"
        with open(out_path, "w") as f:
            json.dump(data, f, indent=2)

        print(f"Wrote {len(word_values)} words to {out_path}: {word_values}")
        return word_values

    finally:
        driver.quit()
