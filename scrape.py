import json
import os
from datetime import date
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.common.by import By

OUTPUT_FILE = "today.json"
ARCHIVE_DIR = Path("archive")


def archive_existing():
    """Move today.json to library/{date}.json if it exists."""
    if not os.path.exists(OUTPUT_FILE):
        return
    with open(OUTPUT_FILE) as f:
        existing = json.load(f)
    existing_date = existing.get("date")
    if not existing_date:
        return
    ARCHIVE_DIR.mkdir(exist_ok=True)
    dest = ARCHIVE_DIR / f"{existing_date}.json"
    os.replace(OUTPUT_FILE, dest)
    print(f"Archived {OUTPUT_FILE} → {dest}")


def scrape_words():
    archive_existing()

    options = webdriver.ChromeOptions()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")

    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(30)

    try:
        driver.get("https://www.nytimes.com/games/connections")

        play_button = driver.find_element(
            By.XPATH, "//button[@data-testid='moment-btn-play']"
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

        data = {
            "date": date.today().isoformat(),
            "words": word_values,
        }

        with open(OUTPUT_FILE, "w") as f:
            json.dump(data, f, indent=2)

        print(f"Wrote {len(word_values)} words to {OUTPUT_FILE}: {word_values}")
        return word_values

    finally:
        driver.quit()
