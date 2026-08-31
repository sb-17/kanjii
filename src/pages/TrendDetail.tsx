// One Analytics chart, opened up: pick how far back to look and how coarsely to
// bucket it. Reached by tapping a chart on /analytics.
//
// A route rather than a modal on purpose. The shell is fixed with `.app-content`
// as the only scroller, so an overlay would need its own scroll containment,
// focus trap and escape handling — the area this app has historically had the
// most trouble with. A route gets the back button, deep links and Analytics'
// scroll position restored for free.
//
// Every series here comes from `bucketSeries`, the same function the Analytics
// cards use, so this page at 14 days is the card by construction rather than by
// agreement.

import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "../styles/TrendDetail.css";
import EmptyState from "../components/empty-state/EmptyState";
import {
  bucketSeries,
  knownPoints,
  vocabPoints,
  deckPoints,
  type BucketUnit,
  type Point,
  type SeriesBucket,
  startOfBucket,
} from "../lib/analytics";
import { startOfStudyDay } from "../lib/srs";
import { loadEvents, type AppEvent } from "../storage/events";
import { loadUserVocab } from "../storage/userVocab";
import { loadDeckStats } from "../storage/deckStats";
import { useNow } from "../lib/useNow";

type SpanId = "week" | "month" | "year" | "all";

const SPANS: { id: SpanId; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "all", label: "All" },
];

const UNITS: { id: BucketUnit; label: string }[] = [
  { id: "day", label: "Days" },
  { id: "week", label: "Weeks" },
  { id: "month", label: "Months" },
  { id: "year", label: "Years" },
];

// A bucket size is offered only if it divides the chosen span into a readable
// number of bars.
//
// The ceiling is a quarter's worth of days: a year in days is 365 bars, about a
// pixel each on a phone, and no amount of sideways scrolling makes that a chart.
// The floor rules out the degenerate pairings a free grid would produce — a Week
// span bucketed by week is two bars, which is a pair of numbers wearing a chart's
// clothes. Every span still offers at least one bucket at every data horizon,
// from a fortnight of deck stats to several years.
const MIN_BARS = 3;
const MAX_BARS = 92;

type Metric = {
  title: string;
  // Plural noun for the summary line: "1,204 reviews".
  unit: string;
  // Known/week nets reverts out, so its bars go both ways and its total is a
  // change rather than an amount.
  signed?: boolean;
  points: (data: Data) => Point[];
};

type Data = { events: AppEvent[]; vocab: ReturnType<typeof loadUserVocab> };

const METRICS: Record<string, Metric> = {
  reviews: {
    title: "Reviews",
    unit: "reviews",
    points: ({ events }) =>
      events.flatMap((e) => (e.k === "review" ? [{ t: e.t, v: 1 }] : [])),
  },
  writes: {
    title: "Handwriting",
    unit: "writes",
    points: ({ events }) =>
      events.flatMap((e) => (e.k === "write" ? [{ t: e.t, v: 1 }] : [])),
  },
  known: {
    title: "Kanji learned",
    unit: "kanji",
    signed: true,
    points: ({ events }) => knownPoints(events),
  },
  vocab: {
    title: "Words added",
    unit: "words",
    points: ({ vocab }) => vocabPoints(vocab),
  },
  decks: {
    title: "Deck answers",
    unit: "answers",
    points: () => deckPoints(loadDeckStats()),
  },
};

// Where the span starts. Calendar arithmetic, not a fixed number of milliseconds:
// "a year ago" from 29 Feb has to land somewhere real, and a month is not 30 days.
function spanStart(span: SpanId, now: number, earliest: number): number {
  if (span === "all") return earliest;
  const d = new Date(now);
  if (span === "week") d.setDate(d.getDate() - 6);
  else if (span === "month") d.setMonth(d.getMonth() - 1);
  else d.setFullYear(d.getFullYear() - 1);
  return d.getTime();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function bucketLabel(start: number, unit: BucketUnit): string {
  const d = new Date(start);
  if (unit === "year") return String(d.getFullYear());
  if (unit === "month") return MONTHS[d.getMonth()];
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// Full date for the tooltip and the "best" line, where there's room to be exact.
function bucketTitle(start: number, unit: BucketUnit): string {
  const d = new Date(start);
  if (unit === "year") return String(d.getFullYear());
  if (unit === "month") return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return unit === "week" ? `week of ${date}` : date;
}

export default function TrendDetail() {
  const { metric: metricId = "" } = useParams();
  const now = useNow();
  const metric = METRICS[metricId];

  const [span, setSpan] = useState<SpanId>("month");
  // null = follow the span's finest readable bucket. Cleared when the span
  // changes, so switching Week → Year can't strand a choice that no longer fits.
  const [unit, setUnit] = useState<BucketUnit | null>(null);

  const data = useMemo<Data>(
    () => ({ events: loadEvents(), vocab: loadUserVocab() }),
    [],
  );

  const points = useMemo(
    () => (metric ? metric.points(data) : []),
    [metric, data],
  );

  // The first thing this metric ever recorded. Everything before it is absence of
  // records, not absence of study, and the two must not look alike.
  const earliest = useMemo(
    () => points.reduce((min, p) => Math.min(min, p.t), Number.POSITIVE_INFINITY),
    [points],
  );
  const hasData = points.length > 0;

  const from = spanStart(span, now, hasData ? earliest : now);

  // Which bucket sizes divide this span into a readable chart.
  const available = useMemo(
    () =>
      UNITS.filter(({ id }) => {
        const n = bucketSeries([], id, from, now).length;
        return n >= MIN_BARS && n <= MAX_BARS;
      }),
    [from, now],
  );

  const active: BucketUnit =
    available.find((u) => u.id === unit)?.id ?? available[0]?.id ?? "day";

  const series = useMemo(
    () => bucketSeries(points, active, from, now),
    [points, active, from, now],
  );

  if (!metric) {
    return (
      <div className="page page-center">
        <EmptyState
          title="No such chart"
          message="That analytics view doesn't exist."
          actions={[{ to: "/analytics", label: "Analytics" }]}
        />
      </div>
    );
  }

  // Summarised over the *recorded* buckets only.
  //
  // Empty buckets inside the recorded range are counted: a day you studied
  // nothing is a real zero, and skipping it would flatter every gap. Buckets
  // before anything was ever recorded are not, because the chart has just
  // finished saying they aren't zeros — averaging them as zeros would contradict
  // that in the same breath. On a year view with two months of history that's
  // the difference between "184 per month" and "597".
  const recordedFrom = hasData ? startOfBucket(earliest, active) : 0;
  const recorded = series.filter((b) => b.start >= recordedFrom);

  const total = recorded.reduce((n, b) => n + b.value, 0);
  const best = recorded.reduce<SeriesBucket | null>(
    (top, b) => (top === null || b.value > top.value ? b : top),
    null,
  );
  const average = recorded.length > 0 ? total / recorded.length : 0;

  // Scale from the largest magnitude so a signed chart is symmetrical about zero
  // and an all-zero span doesn't divide by nothing.
  const peak = Math.max(1, ...series.map((b) => Math.abs(b.value)));
  // Half the plot is given to the downward direction only when this span
  // actually goes down. Reserving it unconditionally leaves the Kanji chart
  // looking half-empty for what is, most weeks, a metric that only rises — and
  // the zero line means nothing until there's something below it.
  const split = metric.signed && series.some((b) => b.value < 0);
  // Labels thin out rather than overlapping; every bar keeps its tooltip. Eight
  // is what fits: a "28 Aug" is about 42px and the bars can be as narrow as 12px
  // of pitch, so labelling more often runs them together.
  const labelEvery = Math.ceil(series.length / 8);
  const startsBeforeData = hasData && startOfStudyDay(from) < startOfStudyDay(earliest);

  return (
    <div className="page">
      <Link to="/analytics" className="trend-back">
        ← Analytics
      </Link>
      <h1 className="page-title">{metric.title}</h1>

      <div className="scope-tabs">
        {SPANS.map((s) => (
          <button
            key={s.id}
            className={`scope-tab${span === s.id ? " active" : ""}`}
            onClick={() => {
              setSpan(s.id);
              setUnit(null);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Hidden when the span leaves only one readable bucket — a segmented
          control with a single permanently-selected segment is a label wearing
          a control's clothes. A week can only sensibly be shown as days. */}
      {available.length > 1 && (
        <div className="scope-tabs">
          {available.map((u) => (
            <button
              key={u.id}
              className={`scope-tab${active === u.id ? " active" : ""}`}
              onClick={() => setUnit(u.id)}
            >
              {u.label}
            </button>
          ))}
        </div>
      )}

      {!hasData ? (
        <p className="stat-note">Nothing recorded yet.</p>
      ) : (
        <>
          {/* Flex with a gap, not text separators. The separators used to carry
              their own spaces (" · ") and were hidden on a narrow screen, which
              took the spaces with them — "+15 kanji0.5 per daybest 3". The gap
              does the spacing now, so dropping the dots can't glue words
              together, and the parts wrap as whole phrases. */}
          <p className="trend-summary">
            <span className="trend-summary-part">
              <strong>
                {metric.signed && total > 0 ? "+" : ""}
                {total.toLocaleString()}
              </strong>{" "}
              {metric.unit}
            </span>
            <span className="trend-summary-dot" aria-hidden="true">
              ·
            </span>
            <span className="trend-summary-part">
              {average.toFixed(average < 10 ? 1 : 0)} per {active}
            </span>
            {best && best.value > 0 && (
              <>
                <span className="trend-summary-dot" aria-hidden="true">
                  ·
                </span>
                <span className="trend-summary-part">
                  best {best.value.toLocaleString()} (
                  {bucketTitle(best.start, active)})
                </span>
              </>
            )}
          </p>

          {/* Wide spans overflow deliberately: the bars keep a legible minimum
              width and the container scrolls, rather than every bar shrinking to
              a hairline. The page itself must never scroll sideways. */}
          <div className="trend-chart-scroll">
            {/* Columns are sized to fit their own numbers rather than to a fixed
                minimum: a chart of single digits shouldn't be as wide as one
                reading 1,204. Wider than the viewport simply scrolls — and the
                bucket picker is the way to get a whole span on screen, since
                Year/Months is twelve columns where Year/Weeks is fifty-two. */}
            <div
              className="trend-plot"
              style={
                {
                  "--trend-min": `${Math.max(
                    14,
                    String(peak).length * 8 + (metric.signed ? 12 : 6),
                  )}px`,
                } as React.CSSProperties
              }
            >
              {/* Two halves per column rather than one absolutely-positioned
                  bar: it makes the scale right by construction, since a signed
                  bar's 100% is half the plot, and it's the shape the Analytics
                  card's signed chart already uses. */}
              {/* `signed` carries the colours, `split` the two-half layout —
                  they're separate because a signed metric with no dip in this
                  span still wants its own colour, just not the empty half. */}
              <div
                className={`trend-bars${metric.signed ? " signed" : ""}${
                  split ? " split" : ""
                }`}
              >
                {series.map((b) => (
                  <div
                    className="trend-col"
                    key={b.start}
                    title={`${bucketTitle(b.start, active)}: ${b.value} ${metric.unit}`}
                  >
                    <span className="trend-half top">
                      {/* The value is the point of the chart; the bar height is
                          the comparison. Both, on every bucket — the Analytics
                          card this drills into prints its numbers too, and
                          dropping them here made the detail view worse than the
                          summary. Zero included: a day you did nothing is a
                          fact, not a gap. */}
                      {(!split || b.value >= 0) && (
                        <span className="trend-count">
                          {metric.signed && b.value > 0 ? "+" : ""}
                          {b.value}
                        </span>
                      )}
                      {b.value > 0 && (
                        <span
                          className="trend-fill"
                          style={{ height: `${(b.value / peak) * 100}%` }}
                        />
                      )}
                    </span>
                    {split && (
                      <span className="trend-half bottom">
                        {b.value < 0 && (
                          <span
                            className="trend-fill negative"
                            style={{ height: `${(-b.value / peak) * 100}%` }}
                          />
                        )}
                        {b.value < 0 && (
                          <span className="trend-count">{b.value}</span>
                        )}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {/* Its own grid, matching the bars column for column, so a label
                  can overflow into a blank neighbour's width instead of being
                  clipped to one bar. */}
              <div className="trend-labels">
                {series.map((b, i) => (
                  <span className="trend-label" key={b.start}>
                    {i % labelEvery === 0 ? bucketLabel(b.start, active) : ""}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {startsBeforeData && (
            <p className="stat-note trend-horizon">
              Nothing recorded before {bucketTitle(earliest, "day")} — the bars
              before it are missing history, not an empty stretch.
            </p>
          )}
        </>
      )}
    </div>
  );
}
