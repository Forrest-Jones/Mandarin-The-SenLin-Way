/* Mandarin The SenLin Way — pinyin system
   Initials -> ACTORS, finals -> SETS (places), tones -> ROOMS inside the set.
   Every character's scene = actor + set + room + props: the SenLin memory system. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SENLIN_PINYIN = factory();
})(this, function () {
  'use strict';

  /* ---------- Initials (actors) ---------- */
  const initials = [
    { key: 'b',  ipa: 'p (unaspirated)', hint: 'like the p in “spin” — no puff of air', ex: 'bā 八', actor: 'Batman' },
    { key: 'p',  ipa: 'pʰ', hint: 'like the p in “pin” — strong puff of air', ex: 'pá 爬', actor: 'Pikachu' },
    { key: 'm',  ipa: 'm', hint: 'as in English', ex: 'mā 妈', actor: 'Mario' },
    { key: 'f',  ipa: 'f', hint: 'as in English', ex: 'fēi 飞', actor: 'Frodo' },
    { key: 'd',  ipa: 't (unaspirated)', hint: 'like the t in “stop” — no puff', ex: 'dà 大', actor: 'Darth Vader' },
    { key: 't',  ipa: 'tʰ', hint: 'like the t in “top” — big puff', ex: 'tā 他', actor: 'Thor' },
    { key: 'n',  ipa: 'n', hint: 'as in English', ex: 'nǐ 你', actor: 'Neo' },
    { key: 'l',  ipa: 'l', hint: 'as in English', ex: 'lái 来', actor: 'Luke Skywalker' },
    { key: 'g',  ipa: 'k (unaspirated)', hint: 'like the k in “skip” — no puff', ex: 'gè 个', actor: 'Gandalf' },
    { key: 'k',  ipa: 'kʰ', hint: 'like the k in “kit” — big puff', ex: 'kàn 看', actor: 'Kermit' },
    { key: 'h',  ipa: 'x', hint: 'rougher than English h — a light throat-clearing', ex: 'hǎo 好', actor: 'Harry Potter' },
    { key: 'j',  ipa: 'tɕ', hint: 'like “jee” but with the tongue tip DOWN behind the lower teeth', ex: 'jiā 家', actor: 'James Bond' },
    { key: 'q',  ipa: 'tɕʰ', hint: 'like “chee” with the tongue tip down — always followed by i or ü', ex: 'qù 去', actor: 'Queen Elizabeth' },
    { key: 'x',  ipa: 'ɕ', hint: 'between “see” and “she”, tongue tip down, big smile', ex: 'xiǎo 小', actor: 'Xena' },
    { key: 'zh', ipa: 'ʈʂ', hint: 'like “j” in “judge” with the tongue tip curled back', ex: 'zhōng 中', actor: 'Jackie Chan' },
    { key: 'ch', ipa: 'ʈʂʰ', hint: 'like “ch” in “church” with the tongue curled back', ex: 'chī 吃', actor: 'Charlie Chaplin' },
    { key: 'sh', ipa: 'ʂ', hint: 'like “sh” in “shirt” with the tongue curled back', ex: 'shì 是', actor: 'Sherlock Holmes' },
    { key: 'r',  ipa: 'ɻ', hint: 'like the “r” in “rug” with a hint of the “s” in “measure”', ex: 'rén 人', actor: 'Rocky Balboa' },
    { key: 'z',  ipa: 'ts', hint: 'like “ds” in “kids”', ex: 'zài 在', actor: 'Zorro' },
    { key: 'c',  ipa: 'tsʰ', hint: 'like “ts” in “cats” with a puff of air', ex: 'cài 菜', actor: 'Cinderella' },
    { key: 's',  ipa: 's', hint: 'as in English', ex: 'sān 三', actor: 'Superman' },
    { key: 'y',  ipa: 'j / (silent)', hint: 'a spelling helper before i, ü finals', ex: 'yī 一', actor: 'Yoda' },
    { key: 'w',  ipa: 'w / (silent)', hint: 'a spelling helper before u finals', ex: 'wǒ 我', actor: 'Wonder Woman' },
    { key: '∅a', ipa: '—', hint: 'no initial: the syllable starts with a-', ex: 'ài 爱', actor: 'Aladdin' },
    { key: '∅e', ipa: '—', hint: 'no initial: the syllable starts with e-', ex: 'èr 二', actor: 'Elmo' },
    { key: '∅o', ipa: '—', hint: 'no initial: the syllable starts with o-', ex: 'ō 哦', actor: 'Oprah' }
  ];

  /* ---------- Finals (sets / locations) ---------- */
  const finals = [
    { key: 'a',    hint: 'open “ah”', ex: 'mā 妈', set: 'your childhood home' },
    { key: 'o',    hint: '“aw” with rounded lips (only after b p m f)', ex: 'wǒ 我', set: 'your current home' },
    { key: 'e',    hint: '“uh” in the throat, unrounded', ex: 'hē 喝', set: 'your school' },
    { key: 'i',    hint: '“ee”; after z c s zh ch sh r it is a buzzed “zz”', ex: 'nǐ 你', set: 'your workplace' },
    { key: 'u',    hint: '“oo” with tight round lips', ex: 'bù 不', set: 'your grandparents’ house' },
    { key: 'ü',    hint: 'say “ee” and round the lips (spelled u after j q x y)', ex: 'nǚ 女', set: 'a best friend’s house' },
    { key: 'ai',   hint: '“eye”', ex: 'lái 来', set: 'a hospital' },
    { key: 'ei',   hint: '“ay” as in “day”', ex: 'bēi 杯', set: 'an airport' },
    { key: 'ao',   hint: '“ow” as in “cow”', ex: 'hǎo 好', set: 'a stadium' },
    { key: 'ou',   hint: '“oh” as in “low”', ex: 'gǒu 狗', set: 'a shopping mall' },
    { key: 'an',   hint: '“ahn”', ex: 'sān 三', set: 'a temple or church' },
    { key: 'en',   hint: '“un” as in “fun”', ex: 'rén 人', set: 'a hotel' },
    { key: 'ang',  hint: '“ahng” — open nasal', ex: 'shàng 上', set: 'a gym' },
    { key: 'eng',  hint: '“ung” as in “lung”', ex: 'lěng 冷', set: 'a library' },
    { key: 'ong',  hint: '“oong”', ex: 'zhōng 中', set: 'a police station' },
    { key: 'er',   hint: '“are” with a curled tongue', ex: 'èr 二', set: 'a restaurant' },
    { key: 'ia',   hint: '“yah”', ex: 'jiā 家', set: 'a zoo' },
    { key: 'ie',   hint: '“yeh”', ex: 'xiè 谢', set: 'a movie theater' },
    { key: 'iao',  hint: '“yow”', ex: 'xiǎo 小', set: 'a beach house' },
    { key: 'iu',   hint: '“yoh” (really i-ou)', ex: 'liù 六', set: 'a museum' },
    { key: 'ian',  hint: '“yen”', ex: 'tiān 天', set: 'a bank' },
    { key: 'in',   hint: '“een”', ex: 'jīn 今', set: 'a farm' },
    { key: 'iang', hint: '“yahng”', ex: 'xiǎng 想', set: 'a train station' },
    { key: 'ing',  hint: '“eeng”', ex: 'xīng 星', set: 'a fire station' },
    { key: 'iong', hint: '“yoong”', ex: 'xióng 熊', set: 'a castle' },
    { key: 'ua',   hint: '“wah”', ex: 'huà 话', set: 'a garage' },
    { key: 'uo',   hint: '“woh”', ex: 'zuò 坐', set: 'a supermarket' },
    { key: 'uai',  hint: '“why”', ex: 'kuài 块', set: 'a courthouse' },
    { key: 'ui',   hint: '“way” (really u-ei)', ex: 'huì 会', set: 'a hair salon' },
    { key: 'uan',  hint: '“wahn”', ex: 'guān 关', set: 'a park' },
    { key: 'un',   hint: '“wun” (really u-en)', ex: 'kùn 困', set: 'a bakery' },
    { key: 'uang', hint: '“wahng”', ex: 'huáng 黄', set: 'a casino' },
    { key: 'üe',   hint: '“yweh”', ex: 'xué 学', set: 'a bookstore' },
    { key: 'üan',  hint: '“ywen”', ex: 'yuán 元', set: 'a swimming pool' },
    { key: 'ün',   hint: '“ywin”', ex: 'yún 云', set: 'a gas station' }
  ];

  /* ---------- Tones (rooms) ---------- */
  const tones = [
    { n: 1, name: 'First tone',   contour: 'high & flat  ˉ', hint: 'sing it like a doctor’s “ahhh”', room: 'outside the front door' },
    { n: 2, name: 'Second tone',  contour: 'rising  ˊ',      hint: 'like a surprised “what?”', room: 'the kitchen' },
    { n: 3, name: 'Third tone',   contour: 'low dip  ˇ',     hint: 'low and creaky, like a doubtful “we-ell…”', room: 'the bedroom' },
    { n: 4, name: 'Fourth tone',  contour: 'falling  ˋ',     hint: 'sharp, like a command: “No!”', room: 'the bathroom' },
    { n: 5, name: 'Neutral tone', contour: 'light & short',  hint: 'quick and unstressed, borrows pitch from the syllable before', room: 'the hallway' }
  ];

  /* ---------- Tone-pair drills (all 20 combinations) ---------- */
  const tonePairs = [
    { pair: '1-1', ex: '今天 jīntiān', en: 'today' },
    { pair: '1-2', ex: '中国 Zhōngguó', en: 'China' },
    { pair: '1-3', ex: '生日 shēngrì', en: 'birthday (1-4 in speech)' },
    { pair: '1-4', ex: '商店 shāngdiàn', en: 'shop' },
    { pair: '2-1', ex: '明天 míngtiān', en: 'tomorrow' },
    { pair: '2-2', ex: '同学 tóngxué', en: 'classmate' },
    { pair: '2-3', ex: '苹果 píngguǒ', en: 'apple' },
    { pair: '2-4', ex: '学校 xuéxiào', en: 'school' },
    { pair: '3-1', ex: '老师 lǎoshī', en: 'teacher' },
    { pair: '3-2', ex: '北京 Běijīng — try 我们 wǒmen', en: 'we (3-5)' },
    { pair: '3-3', ex: '你好 nǐ hǎo → ní hǎo', en: 'hello (sandhi: 3-3 → 2-3)' },
    { pair: '3-4', ex: '喜欢 xǐhuan / 请坐 qǐng zuò', en: 'like / please sit' },
    { pair: '4-1', ex: '看书 kàn shū', en: 'read a book' },
    { pair: '4-2', ex: '大学 dàxué', en: 'university' },
    { pair: '4-3', ex: '电脑 diànnǎo', en: 'computer' },
    { pair: '4-4', ex: '再见 zàijiàn', en: 'goodbye' },
    { pair: '1-5', ex: '妈妈 māma', en: 'mom' },
    { pair: '2-5', ex: '朋友 péngyou', en: 'friend' },
    { pair: '3-5', ex: '我们 wǒmen', en: 'we' },
    { pair: '4-5', ex: '爸爸 bàba', en: 'dad' }
  ];

  /* ---------- Pronunciation Mastery: the first 12 days ---------- */
  const pronunciationDays = [
    { title: 'The four tones (and the fifth)', focus: 'tones', tones: [1, 2, 3, 4, 5],
      brief: 'Mandarin is a tonal language: the pitch pattern of a syllable changes the word. “mā” is mother, “mǎ” is horse. Before a single character, own the tones.',
      drills: ['mā má mǎ mà ma', 'bā bá bǎ bà', 'yī yí yǐ yì'],
      task: 'Hum each contour with your hand drawing the shape in the air. Then say the “ma” series five times, slowly.' },
    { title: 'Actors: b p m f', focus: 'initials', initials: ['b', 'p', 'm', 'f'], finalsIntro: ['a', 'o', 'e'],
      brief: 'Every initial sound becomes an ACTOR in your memory movies. The first four are lip sounds. Notice b/p differ only by the puff of air.',
      drills: ['bā pā mā fā', 'bō pō mō fō', 'bǎ pǎ mǎ fǎ'],
      task: 'Hold a tissue in front of your mouth: it should move for p, not for b. Then cast your first four actors below.' },
    { title: 'Actors: d t n l', focus: 'initials', initials: ['d', 't', 'n', 'l'], finalsIntro: ['i', 'u', 'ü'],
      brief: 'Tongue-tip sounds. Same rule: d has no puff, t does. Meet the six simple finals — each one is a SET, a place your movies happen in.',
      drills: ['dā tā nā lā', 'dì tì nì lì', 'dù tù nǔ lǚ'],
      task: 'Say nǚ (woman) vs nù (angry): the ü is “ee” with rounded lips. Cast d t n l and your six basic sets.' },
    { title: 'Actors: g k h', focus: 'initials', initials: ['g', 'k', 'h'], finalsIntro: ['ai', 'ei', 'ao', 'ou'],
      brief: 'Back-of-the-tongue sounds. Mandarin h is rougher than English h — think of fogging a mirror.',
      drills: ['gāi kāi hāi', 'gěi kěi hēi', 'gāo kāo hǎo', 'gǒu kǒu hòu'],
      task: 'Cast g k h. Assign four new sets for ai ei ao ou.' },
    { title: 'Actors: j q x — the smile sounds', focus: 'initials', initials: ['j', 'q', 'x'], finalsIntro: ['an', 'en', 'ang', 'eng'],
      brief: 'j q x are only ever followed by i or ü. Tongue tip down behind the lower teeth, lips in a wide smile. The “u” after j q x is secretly ü.',
      drills: ['jī qī xī', 'jiā qiā xiā', 'jù qù xù (all ü!)'],
      task: 'Alternate ji / zhi (tomorrow’s sound) to feel the difference: smile for ji, curl back for zhi.' },
    { title: 'Actors: zh ch sh r — the curled sounds', focus: 'initials', initials: ['zh', 'ch', 'sh', 'r'], finalsIntro: ['ong', 'er'],
      brief: 'Retroflex: curl the tongue tip up and back. The “i” after these is not “ee” but a buzz: zhī chī shī rì.',
      drills: ['zhī chī shī rì', 'zhōng chōng shōng róng', 'zhè chè shè rè'],
      task: 'Cast the four curled-tongue actors. Say 是 shì ten times: it is the most common verb you will ever use.' },
    { title: 'Actors: z c s — the buzz sounds', focus: 'initials', initials: ['z', 'c', 's'], finalsIntro: ['ia', 'ie', 'iao', 'iu'],
      brief: 'z = “ds”, c = “ts”, s = “s”. Tongue tip flat behind the upper teeth (not curled). Contrast them with yesterday’s zh ch sh.',
      drills: ['zī cī sī', 'zài cài sài', 'zuò cuò suǒ', 'zhī zī · chī cī · shī sī'],
      task: 'Cast z c s. Add four i-sets: ia ie iao iu.' },
    { title: 'Actors: y w and the “no-initial” trio', focus: 'initials', initials: ['y', 'w', '∅a', '∅e', '∅o'], finalsIntro: ['ian', 'in', 'iang', 'ing', 'iong'],
      brief: 'Syllables that begin with i/u/ü are written with y/w. Syllables that begin with a/e/o have no initial at all — the SenLin Way gives them their own three actors.',
      drills: ['yī yá yě yòu', 'wǒ wǔ wài wèn', 'ài èr ō'],
      task: 'Cast Yoda, Wonder Woman, and your three no-initial actors. Add the five nasal i-sets.' },
    { title: 'The u-sets and ü-sets', focus: 'finals', finalsIntro: ['ua', 'uo', 'uai', 'ui', 'uan', 'un', 'uang', 'üe', 'üan', 'ün'],
      brief: 'The last ten finals all start with a rounded u or ü glide. ui is really u-ei, un is really u-en.',
      drills: ['huā huó huài huì', 'guān gùn guāng', 'xué yuán yún'],
      task: 'Assign the last ten sets. You now have a place for every syllable in Mandarin.' },
    { title: 'Tone pairs I (1-x and 2-x)', focus: 'tonepairs', pairs: ['1-1', '1-2', '1-3', '1-4', '2-1', '2-2', '2-3', '2-4', '1-5', '2-5'],
      brief: 'Real speech is tones in sequence. Drill every two-tone combination until the shapes are automatic. This is the single highest-leverage pronunciation practice.',
      drills: [],
      task: 'Say each pair three times, then say it inside the example word. Record yourself once and compare with the speaker.' },
    { title: 'Tone pairs II (3-x, 4-x) and sandhi', focus: 'tonepairs', pairs: ['3-1', '3-2', '3-3', '3-4', '4-1', '4-2', '4-3', '4-4', '3-5', '4-5'],
      brief: 'Two third tones in a row: the first becomes a second tone (nǐ hǎo → ní hǎo). 不 bù becomes bú before a 4th tone (bú shì). 一 yī becomes yí before 4th tone and yì elsewhere.',
      drills: ['nǐ hǎo → ní hǎo', 'bù shì → bú shì', 'yī gè → yí gè'],
      task: 'Drill the ten pairs. Then say 你好, 不是, 一个 with correct sandhi.' },
    { title: 'Props: how characters are built', focus: 'props',
      brief: 'Characters are made of reusable parts (components / radicals). Each part becomes a PROP in your movie. Tomorrow you plant your first tree. Today, meet the ten most useful props and give each one a physical object.',
      props: ['口', '亻', '女', '子', '日', '月', '木', '氵', '讠', '扌'],
      drills: [],
      task: 'Open the Cast page, find these ten props and picture the object in your hands. Then read “The SenLin Way” method page once.' }
  ];

  return { initials, finals, tones, tonePairs, pronunciationDays };
});
