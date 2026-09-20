/* Mandarin The SenLin Way — what each HSK level means.
   HSK (汉语水平考试, Hànyǔ Shuǐpíng Kǎoshì) is the PRC's standardised Chinese proficiency
   test, administered by the Center for Language Education and Cooperation / Chinese
   Testing International (中国汉考国际). Figures below follow the HSK 2.0 standard (2010–)
   that the six-level word lists and the《HSK标准教程》(HSK Standard Course, Beijing
   Language and Culture University Press, ed. 姜丽萍) textbooks are built on. Study-hour
   estimates are the commonly cited ranges from Hanban guidance and university programmes;
   people vary a lot.                                                                     */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SENLIN_LEVELINFO = factory();
})(this, function () {
  'use strict';
  return {
    about: 'HSK is the official Chinese-government proficiency test. Universities use HSK 4–5 for admission to Chinese-taught degrees; employers and visas commonly ask for HSK 4 (general business) or HSK 5–6 (professional). The SenLin road follows the official six-level HSK 2.0 vocabulary exactly: each level’s characters, words and grammar are taught before you move up.',
    levels: [
      { level: 1, name: 'HSK 1', cefr: 'A1', words: 150, cumWords: 150, hours: [60, 100], book: 'HSK Standard Course 1 — 15 lessons',
        canDo: 'Understand and use very simple words and phrases: greetings, introducing yourself, numbers, time, family, simple shopping. Prepared for further study.',
        exam: 'Listening 20 questions (~15 min) + Reading 20 questions (17 min). Pinyin is printed. 200 points, pass at 120.',
        topics: ['你好 Greetings', '谢谢你 Thanks and courtesy', '你叫什么名字 Names and nationality', '她是我的汉语老师 People and jobs', '她女儿今年二十岁 Age and family', '我会说汉语 Abilities', '今天几号 Dates and days', '你想喝点儿什么 Food and drink', '你儿子在哪儿工作 Places and work', '我能坐这儿吗 Permission and requests', '我们什么时候去 Time and plans', '明天天气怎么样 Weather', '他在学做中国菜呢 Actions in progress', '她买了不少衣服 Shopping and completed actions', '我是坐飞机来的 Travel and the 是…的 pattern'] },
      { level: 2, name: 'HSK 2', cefr: 'A2', words: 150, cumWords: 300, hours: [120, 200], book: 'HSK Standard Course 2 — 15 lessons',
        canDo: 'Simple, direct exchanges on familiar daily topics: directions, transport, health, shopping, hobbies, making plans. Basic level of elementary Chinese.',
        exam: 'Listening 35 questions (~25 min) + Reading 25 questions (22 min). Pinyin printed. 200 points, pass at 120.',
        topics: ['九月去北京旅游最好 Seasons and travel', '我每天六点起床 Daily routine', '左边那个红色的是我的 Colours and position', '这个工作是他帮我介绍的 Work and introductions', '就买这个吧 Shopping decisions', '你怎么不吃了 Food and reasons', '你看过那个电影吗 Experiences with 过', '让我想想再告诉你 Making decisions', '题太多，我没做完 Result complements', '别找了，手表在这儿呢 Locations and 别', '他比我大三岁 Comparisons', '你穿得太少了 Degree complements', '门开着呢 States with 着', '你别哭了 Emotions', '我也有过这样的时候 Talking about the past'] },
      { level: 3, name: 'HSK 3', cefr: 'B1', words: 300, cumWords: 600, hours: [300, 400], book: 'HSK Standard Course 3 — 20 lessons',
        canDo: 'Handle daily life, study and work in Chinese; manage most travel situations in China; talk about opinions, plans and simple stories.',
        exam: 'Listening 40 (~35 min) + Reading 30 (30 min) + Writing 10 (15 min: reorder words, write characters). No pinyin. 300 points, pass at 180.',
        topics: ['Weekend plans', 'Health and habits', 'Sports and hobbies', 'Directions and cities', 'Comparing and choosing', 'Environment and weather', 'Stories with 一边…一边', 'The 把 sentence', 'Passive 被', 'Conditions with 如果', 'Sequence with 先…然后', 'Reasons and results', 'Feelings and personality', 'Travel and photos', 'Making requests', 'Culture and festivals', 'Money and banking', 'Study methods', 'Describing people', 'Reviewing the year'] },
      { level: 4, name: 'HSK 4', cefr: 'B2', words: 600, cumWords: 1200, hours: [600, 800], book: 'HSK Standard Course 4 上 / 下 — 20 lessons',
        canDo: 'Discuss a wide range of topics fluently and communicate with native speakers on general subjects; read short essays and articles. The level most employers and universities ask for.',
        exam: 'Listening 45 (~30 min) + Reading 40 (40 min) + Writing 15 (25 min: reorder words, write a sentence from a picture). 300 points, pass at 180.',
        topics: ['Personality and relationships', 'Work and careers', 'Society and environment', 'Education and learning', 'Science and technology', 'Travel and geography', 'Health and food', 'Media and opinions', 'History and culture', 'Economy and consumption', 'Complex sentences: 不但…而且, 无论…都, 只要…就, 连…都', 'Potential and direction complements'] },
      { level: 5, name: 'HSK 5', cefr: 'C1', words: 1300, cumWords: 2500, hours: [1200, 1500], book: 'HSK Standard Course 5 上 / 下 — 36 lessons',
        canDo: 'Read Chinese newspapers and magazines, follow films and television, and deliver a full speech or presentation. Working proficiency for professional roles.',
        exam: 'Listening 45 (~30 min) + Reading 45 (45 min) + Writing 10 (40 min: reorder words, write two 80-character pieces). 300 points, pass at 180.',
        topics: ['Idioms and set phrases', 'Argument and opinion', 'Business and negotiation', 'Chinese philosophy and history', 'Nature and environment', 'Psychology and emotion', 'Law and society', 'Science and discovery', 'Literature and art', 'Formal written style: 之所以…是因为, 与其…不如, 宁可…也, 凡是…都'] },
      { level: 6, name: 'HSK 6', cefr: 'C2', words: 2500, cumWords: 5000, hours: [2200, 2500], book: 'HSK Standard Course 6 上 / 下 — 40 lessons',
        canDo: 'Understand written and spoken Chinese with ease and express yourself fluently in speech and writing on any topic, including specialised professional and academic material. The top of the standard test.',
        exam: 'Listening 50 (~35 min) + Reading 50 (50 min) + Writing 1 (45 min: read a 1,000-character article for 10 minutes, then rewrite it in 400 characters). 300 points, pass at 180.',
        topics: ['Essays and editorials', 'Economics and finance', 'Politics and international relations', 'Classical culture and idioms (成语)', 'Science and medicine', 'Literature excerpts', 'Formal connectors: 固然…但是, 哪怕…也, 非…不可, 以免, 至于'] }
    ],
    /* the "new HSK" 3.0 (2021) reorganises into 9 bands; the exam still runs on the six levels above */
    note30: 'Since 2021 China has published a nine-band HSK 3.0 standard (bands 1–9, with 7–9 for advanced/academic use). The six-level exam described here is still the one administered worldwide and the one this course targets; the 3.0 bands 1–6 broadly map onto HSK 2.0 levels 1–6 with more vocabulary per band.'
  };
});
