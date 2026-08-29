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


def _visible_cards(driver):
    """Wait condition: all 16 puzzle cards present and rendered, else falsy."""
    cards = driver.find_elements(By.XPATH, "//input[@data-testid='card-input']")
    if len(cards) == 16 and all(c.is_displayed() for c in cards):
        return cards
    return False


def _open_board(driver, timeout=20):
    """Click play and return the 16 card inputs once the board has rendered.

    The board renders asynchronously, so the cards are not in the DOM yet when
    click() returns -- reading them immediately is a race. The click can also
    land before the handler is bound, in which case the board never opens and
    waiting alone cannot recover, so we re-click once before giving up.
    """
    play = WebDriverWait(driver, timeout=10).until(
        lambda d: d.find_element(By.XPATH, "//button[@data-testid='moment-btn-play']")
    )
    play.click()

    for attempt in range(2):
        try:
            return WebDriverWait(driver, timeout=timeout).until(_visible_cards)
        except TimeoutException:
            if attempt == 0:
                try:
                    driver.find_element(
                        By.XPATH, "//button[@data-testid='moment-btn-play']"
                    ).click()
                except Exception:
                    pass

    found = len(driver.find_elements(By.XPATH, "//input[@data-testid='card-input']"))
    raise Exception(f"Board did not render 16 cards after clicking play (found {found})")


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
