# Vocabulary catalog data sources

The catalog is separate from Personal Vault user vocabulary.  A user only gets
an individual study card after choosing **收藏** or **加入學習**.  Dataset updates
use stable source identifiers and never delete review progress.

## Japanese — OpenJLPT

The Japanese JLPT common-word catalog is imported from
[OpenJLPT](https://github.com/evanclan/OpenJLPT), licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

OpenJLPT's required attribution includes OpenJLPT, EDRDG's JMdict / EDICT and
KANJIDIC2, Jonathan Waller's JLPT resources for community level assignments,
and Tatoeba for attached example sentences.  See its
[NOTICE](https://github.com/evanclan/OpenJLPT/blob/main/NOTICE.md).  JLPT N5–N1
labels in Personal Vault are **community common-word groupings**, not an
official published JLPT word list.

## English — TOEIC common vocabulary

The English catalog is imported from
[完整 TOEIC 單字庫（English–Traditional Chinese）](https://huggingface.co/datasets/kknono668/toeic-vocab-tw),
licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
It is displayed as **TOEIC 常見字彙**, not an official TOEIC list.

## Updating safely

Run `npm run vocabulary:import` only from a trusted environment holding the
server-only `SUPABASE_SERVICE_ROLE_KEY`. The importer validates each source,
uses batches of 500 rows, records the source version and dataset statistics,
and does not run during a normal application request or application startup.
