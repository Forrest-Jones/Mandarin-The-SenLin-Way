# Native review of HSK 4–6 content

`tools/review.js` exports every sentence, scenario opener and grammar example of HSK 4, 5 and 6
(`hsk4.csv`, `hsk5.csv`, `hsk6.csv`) and every Deal Desk term, phrase and dialogue line
(`business.csv`) for a native Mandarin editor to check. Each row's `id` is the same
16-character hash `tools/audio.js` uses, so a corrected line can be traced to its audio file.

```sh
node tools/review.js                               # HSK 4–6, all kinds, CSV into review/
node tools/review.js --levels 5 --kinds sentences   # one level, one kind
node tools/review.js --format md                    # Markdown tables instead of CSV
node tools/review.js --apply review/hsk4-reviewed.csv   # read the review back → review/hsk4.patch.json
```

## For the reviewer

Open the CSV in a spreadsheet (it is UTF-8 with a BOM, so Excel and Numbers read the
characters correctly), keep the columns and the `id` untouched, and fill in the last three:

| column | what to put |
|---|---|
| `status` | `ok` — natural as is · `fix` — keep but correct · `drop` — remove from the course |
| `reviewer` | your name or handle |
| `note` | for `fix`: the corrected line as `zh\|pinyin\|en`; leave a part empty to keep it (e.g. `\|Wǒmen xiān ānpái yíxià shíjiān.\|` fixes only the pinyin). Anything after a third `\|` is a free comment. For `drop`: the reason. |

Save the file as `<name>-reviewed.csv` (for example `hsk4-reviewed.csv`) and send it back.
Rows left with an empty status are treated as not yet reviewed.

Single items can also be reported with the **Content review** GitHub issue template.

### Checklist

Judge each line as a mainland-China, standard Mandarin (普通话) speaker would.

1. **Naturalness** — would a native speaker actually say this, in this word order? Prefer the
   everyday phrasing over a literal rendering of the English. Mark textbook-stiff or
   translated-sounding lines as `fix`.
2. **Register** — HSK sentences are neutral spoken/written Mandarin; not slang, not classical.
   Deal Desk lines are **正式** business register: 您 for the counterparty, titles (王总, 李董),
   polite hedges (麻烦您, 请问, 不知……是否方便), no colloquial particles that would sound
   unprofessional in a meeting or an email.
3. **Mainland usage** — simplified characters and mainland vocabulary only (软件 not 軟體,
   出租车 not 計程車, 视频 not 影片); no Taiwan/HK/Singapore-only expressions.
4. **Punctuation** — full-width `。，？！：；` and `、` for lists; `“ ”` for quotes; no ASCII
   `.,?!`; exactly one sentence-final mark; no space before punctuation.
5. **Pinyin** — Hanyu Pinyin with tone marks (ā á ǎ à), never tone numbers; `ü` written `ü`
   (nǚ, lǜ), not `v`; words grouped by word (xuéxiào, not xué xiào); capital letter at the start
   of a sentence and for proper names; neutral tone unmarked (de, ma, men).
6. **Tone sandhi is not written** — write the dictionary tones, not the spoken change: 你好 is
   `nǐ hǎo`, 不是 is `bù shì`, 一个 is `yí ge` only where the course already writes it so — keep
   each level consistent with its neighbours rather than "correcting" the convention. Flag
   genuine tone errors (wrong dictionary tone) as `fix`.
7. **Meaning and translation** — does the English say what the Chinese says, at the same level
   of formality? Fix mistranslations; do not polish English that is merely plain.
8. **Level fit** — the line should feel like HSK 4/5/6 material (vocabulary and structures of
   that level), not a children's sentence and not a newspaper editorial. `drop` lines that are
   trivial, contrived or that teach an unnatural collocation.
9. **Characters** — every character in a sentence must be one the course teaches at or before
   that level; if a fix needs a new character, say so in the comment part of the note so the
   maintainer can check `node tools/validate.js`.
10. **Business terms** — the term is the one actually used in PE/VC practice in China
    (估值, 尽职调查, 优先清算权, 对赌协议…); note if there is a more standard form or a common
    abbreviation (尽调, 投委会).

## For the maintainer

`--apply` never edits data files. It writes `review/<name>.patch.json` listing each change with
the data file and path (`js/data/hsk4.js sentences[12]`), the current and proposed `zh|p|en`,
the reviewer and note, and the `newId` of a changed sentence so its audio can be regenerated
(`node tools/audio.js --levels 4 --kinds sentences`; stale files can be deleted by old id).
Apply the patch by hand, then run `node tools/validate.js` and `node --test tools/test.js`.
Rows that could not be matched (already changed, or a garbled id) are listed under `problems`.
