import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from selenium import webdriver
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.common.by import By
from selenium.common.exceptions import TimeoutException

# All puzzle files live in archive, keyed by date in earliest timezone (UTC-12)
ARCHIVE_DIR = Path("archive")
TZ_EARLIEST = "Etc/GMT-12"


def scrape_words():
    # Run in earliest possible timezone (UTC-12, Baker Island) so date rolls over last

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

        play_button = WebDriverWait(driver, timeout=10).until(
            lambda d: d.find_element(By.XPATH, "//button[@data-testid='moment-btn-play']")
        )
        play_button.click()

        first_word = driver.find_element(
            By.XPATH, "//input[@data-testid='card-input']"
        )
        WebDriverWait(driver, timeout=10).until(lambda _: first_word.is_displayed())

        words = driver.find_elements(By.XPATH, "//input[@data-testid='card-input']")

        if len(words) != 16:
            raise Exception(f"Expected 16 words, got {len(words)}")

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
