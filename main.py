from scrape import archive_path, scrape_words


def main():
    # The workflow makes a second scheduled attempt each day so a transient
    # failure costs a retry rather than the puzzle. If the earlier attempt
    # already captured today, skip: rescraping would only risk failing the run
    # (and raising a false alarm) over a puzzle that is already archived.
    out_path = archive_path()
    if out_path.exists():
        print(f"{out_path} already captured; nothing to do.")
        return

    scrape_words()


if __name__ == "__main__":
    main()
