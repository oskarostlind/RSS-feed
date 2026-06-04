const swedishDateFormatter = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatNewsDate(date: Date | null): string {
  if (!date) {
    return "Datum saknas";
  }

  return swedishDateFormatter.format(date);
}
