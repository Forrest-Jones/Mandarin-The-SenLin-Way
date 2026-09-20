/* Mandarin The SenLin Way — grammar patterns ("pattern of the day")
   Each pattern is placed on the first day every character of its example is
   known (like a sentence), at most one per day.  level = the HSK level whose
   grammar list it belongs to.  Keep examples short and only from taught text. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SENLIN_GRAMMAR = factory();
})(this, function () {
  'use strict';
  return [
    /* ---------- HSK 1 ---------- */
    { level: 1, name: 'A 是 B', pattern: 'A + 是 + B', zh: '我是学生。', p: 'Wǒ shì xuésheng.', en: 'I am a student.', note: '是 links two nouns. Never use 是 before an adjective (say 我很好, not 我是好).' },
    { level: 1, name: 'Yes/no with 吗', pattern: 'Statement + 吗？', zh: '你是老师吗？', p: 'Nǐ shì lǎoshī ma?', en: 'Are you a teacher?', note: 'Add 吗 to any statement to make a yes/no question. Word order does not change.' },
    { level: 1, name: '不 for negation', pattern: '不 + verb / adjective', zh: '我不是中国人。', p: 'Wǒ bú shì Zhōngguórén.', en: 'I am not Chinese.', note: '不 negates most verbs and adjectives. Before a 4th tone it is pronounced bú.' },
    { level: 1, name: '很 + adjective', pattern: 'Subject + 很 + adjective', zh: '我很好。', p: 'Wǒ hěn hǎo.', en: 'I am fine.', note: 'Adjectives take 很 instead of 是. Here 很 is nearly meaningless glue, not “very”.' },
    { level: 1, name: '的 possessive', pattern: 'A + 的 + B = A’s B', zh: '这是我的书。', p: 'Zhè shì wǒ de shū.', en: 'This is my book.', note: '的 marks possession or description. With family and close relations it can be dropped: 我妈妈.' },
    { level: 1, name: 'Question words stay in place', pattern: '…什么 / 谁 / 哪儿…', zh: '你叫什么名字？', p: 'Nǐ jiào shénme míngzi?', en: 'What is your name?', note: 'Chinese does not move question words to the front. Put 什么 exactly where the answer would go.' },
    { level: 1, name: '有 / 没有', pattern: 'Subject + 有 / 没有 + object', zh: '我没有猫。', p: 'Wǒ méiyǒu māo.', en: 'I do not have a cat.', note: '有 is negated with 没, never 不.' },
    { level: 1, name: 'Measure words', pattern: 'number + measure word + noun', zh: '我有一个儿子。', p: 'Wǒ yǒu yí ge érzi.', en: 'I have one son.', note: 'Every counted noun needs a measure word. 个 is the all-purpose one; 本 for books, 块 for money.' },
    { level: 1, name: '也 “also”', pattern: 'Subject + 也 + verb', zh: '我也是学生。', p: 'Wǒ yě shì xuésheng.', en: 'I am also a student.', note: '也 goes after the subject and before the verb, never at the end of the sentence.' },
    { level: 1, name: '都 “all / both”', pattern: 'Subject + 都 + verb', zh: '我们都是老师。', p: 'Wǒmen dōu shì lǎoshī.', en: 'We are all teachers.', note: '都 refers back to what comes before it. 也 comes before 都 when both appear: 我们也都是.' },
    { level: 1, name: 'Time before the verb', pattern: 'Subject + time + verb', zh: '我明天去北京。', p: 'Wǒ míngtiān qù Běijīng.', en: 'I am going to Beijing tomorrow.', note: 'Time words sit before the verb (or before the subject), never at the end like in English.' },
    { level: 1, name: '在 “at / in”', pattern: 'Subject + 在 + place + verb', zh: '我在家吃饭。', p: 'Wǒ zài jiā chī fàn.', en: 'I eat at home.', note: 'Location phrases with 在 come before the verb.' },
    { level: 1, name: '会 “can (learned skill)”', pattern: 'Subject + 会 + verb', zh: '我会说汉语。', p: 'Wǒ huì shuō Hànyǔ.', en: 'I can speak Chinese.', note: '会 = an ability you learned; 能 = circumstances allow; 可以 = permission.' },
    { level: 1, name: '了 for completion', pattern: 'verb + 了', zh: '我看见他了。', p: 'Wǒ kànjiàn tā le.', en: 'I saw him.', note: '了 marks a completed action or a changed situation. It is not a past tense; 下雨了 means “it has started raining”.' },
    { level: 1, name: '几 for small numbers', pattern: '几 + measure word + noun', zh: '你有几个朋友？', p: 'Nǐ yǒu jǐ ge péngyou?', en: 'How many friends do you have?', note: '几 expects an answer under ten; 多少 is for any amount and can skip the measure word.' },
    { level: 1, name: '呢 bounce-back question', pattern: 'Noun + 呢？', zh: '我很好，你呢？', p: 'Wǒ hěn hǎo, nǐ ne?', en: 'I am fine, and you?', note: '呢 asks the same question about someone else, or asks where something is: 我的书呢？' },
    { level: 1, name: '太…了', pattern: '太 + adjective + 了', zh: '今天太热了。', p: 'Jīntiān tài rè le.', en: 'It is too hot today.', note: '太…了 means “too” or, enthusiastically, “so”: 太好了!' },
    { level: 1, name: '想 “would like to”', pattern: 'Subject + 想 + verb', zh: '我想吃苹果。', p: 'Wǒ xiǎng chī píngguǒ.', en: 'I want to eat an apple.', note: '想 + verb = want to; 想 + noun = miss / think of.' },

    /* ---------- HSK 2 ---------- */
    { level: 2, name: '比 comparison', pattern: 'A + 比 + B + adjective', zh: '我哥哥比我大三岁。', p: 'Wǒ gēge bǐ wǒ dà sān suì.', en: 'My older brother is three years older than me.', note: 'No 很 in a 比 sentence. To say “much more”, add 多了 after the adjective: 比我大多了.' },
    { level: 2, name: '正在 continuous', pattern: 'Subject + 正在 + verb (+ 呢)', zh: '我正在吃饭。', p: 'Wǒ zhèngzài chī fàn.', en: 'I am eating right now.', note: '在 or 正在 before the verb marks an action in progress. 着 after the verb marks a continuing state.' },
    { level: 2, name: '过 experience', pattern: 'verb + 过', zh: '你去过中国吗？', p: 'Nǐ qùguo Zhōngguó ma?', en: 'Have you ever been to China?', note: '过 = have had the experience of. Negate with 没…过: 我没去过.' },
    { level: 2, name: '因为…所以…', pattern: '因为 A，所以 B', zh: '因为下雨，所以我在家。', p: 'Yīnwèi xià yǔ, suǒyǐ wǒ zài jiā.', en: 'Because it is raining, I am at home.', note: 'Unlike English, both halves are usually spoken: because…therefore….' },
    { level: 2, name: '虽然…但是…', pattern: '虽然 A，但是 B', zh: '虽然很累，但是我很高兴。', p: 'Suīrán hěn lèi, dànshì wǒ hěn gāoxìng.', en: 'Although I am tired, I am happy.', note: 'Same pairing habit: although…but… is correct Chinese, not a double conjunction.' },
    { level: 2, name: '可以 permission', pattern: '可以 + verb + 吗？', zh: '我可以进来吗？', p: 'Wǒ kěyǐ jìnlai ma?', en: 'May I come in?', note: 'Answer with 可以 or 不可以 / 不行, not with 是.' },
    { level: 2, name: '已经…了', pattern: '已经 + verb + 了', zh: '他已经回家了。', p: 'Tā yǐjīng huí jiā le.', en: 'He has already gone home.', note: '已经 pairs with 了 to say something is already done.' },
    { level: 2, name: '离 distance', pattern: 'A + 离 + B + 远 / 近', zh: '学校离我家很近。', p: 'Xuéxiào lí wǒ jiā hěn jìn.', en: 'The school is very near my home.', note: '离 measures distance between two places; 从 (from) is for movement.' },
    { level: 2, name: '从…到…', pattern: '从 A 到 B', zh: '我从早上到晚上都在工作。', p: 'Wǒ cóng zǎoshang dào wǎnshang dōu zài gōngzuò.', en: 'I work from morning to night.', note: 'Works for time and for place: 从北京到上海.' },
    { level: 2, name: 'verb + 一下', pattern: 'verb + 一下', zh: '请等一下。', p: 'Qǐng děng yíxià.', en: 'Please wait a moment.', note: '一下 softens a request: “for a sec”. Doubling the verb does the same: 等等, 看看.' },
    { level: 2, name: '得 complement', pattern: 'verb + 得 + adjective', zh: '他说得很好。', p: 'Tā shuō de hěn hǎo.', en: 'He speaks very well.', note: '得 (de) attaches an adverb of manner after the verb. With an object, repeat the verb: 他说汉语说得很好.' },
    { level: 2, name: '要 “going to / must”', pattern: 'Subject + 要 + verb', zh: '我生病了，要吃药。', p: 'Wǒ shēngbìng le, yào chī yào.', en: 'I am sick and need to take medicine.', note: '要 covers “want to”, “am going to” and “need to”; context decides.' },
    { level: 2, name: '每…都…', pattern: '每 + measure + noun + 都 + verb', zh: '我每天都跑步。', p: 'Wǒ měi tiān dōu pǎobù.', en: 'I jog every day.', note: '每 loves to be followed by 都 before the verb.' },
    { level: 2, name: '别 “don’t”', pattern: '别 + verb', zh: '别说话！', p: 'Bié shuō huà!', en: 'Don’t talk!', note: '别 (or 不要) makes a negative command.' },
    { level: 2, name: '最 superlative', pattern: '最 + adjective', zh: '这是我最喜欢的歌。', p: 'Zhè shì wǒ zuì xǐhuan de gē.', en: 'This is my favourite song.', note: '最 before an adjective or a feeling verb makes the superlative.' },
    { level: 2, name: '吧 suggestion', pattern: 'Statement + 吧', zh: '我们走吧。', p: 'Wǒmen zǒu ba.', en: 'Let’s go.', note: '吧 softens a statement into a suggestion or a guess: 你是老师吧？ “You’re a teacher, right?”' },
    /* ---------- HSK 3 ---------- */
    { level: 3, name: '把 sentence', pattern: 'Subject + 把 + object + verb + result', zh: '请把书给我。', p: 'Qǐng bǎ shū gěi wǒ.', en: 'Please give me the book.', note: '把 moves the object before the verb to say what is done to it. The verb must carry a result (给我, 放好, 吃完).' },
    { level: 3, name: '被 passive', pattern: 'A + 被 + B + verb + result', zh: '我的手机被弟弟拿走了。', p: 'Wǒ de shǒujī bèi dìdi ná zǒu le.', en: 'My phone was taken by my little brother.', note: '被 marks the passive, often for things that happen to you. The doer can be left out: 手机被拿走了.' },
    { level: 3, name: '越来越', pattern: '越来越 + adjective', zh: '天气越来越热了。', p: 'Tiānqì yuè lái yuè rè le.', en: 'The weather is getting hotter and hotter.', note: '越 A 越 B = the more A, the more B: 越多越好.' },
    { level: 3, name: '一边…一边…', pattern: '一边 + verb 1 + 一边 + verb 2', zh: '他一边吃饭一边看电视。', p: 'Tā yìbiān chī fàn yìbiān kàn diànshì.', en: 'He eats while watching TV.', note: 'Two actions at the same time by the same person.' },
    { level: 3, name: '又…又…', pattern: '又 + adjective + 又 + adjective', zh: '这个菜又便宜又好吃。', p: 'Zhè ge cài yòu piányi yòu hǎochī.', en: 'This dish is both cheap and delicious.', note: 'Two qualities at once. 又 also means “again” for a past repeat; 再 is “again” for the future.' },
    { level: 3, name: '除了…以外', pattern: '除了 A 以外，都 / 还…', zh: '除了我以外，大家都去了。', p: 'Chúle wǒ yǐwài, dàjiā dōu qù le.', en: 'Everyone went except me.', note: 'With 都 it means “except”; with 还 / 也 it means “besides, in addition to”.' },
    { level: 3, name: '如果…就…', pattern: '如果 A，(subject) 就 B', zh: '如果明天下雨，我就不去了。', p: 'Rúguǒ míngtiān xià yǔ, wǒ jiù bú qù le.', en: 'If it rains tomorrow, I won’t go.', note: '就 sits after the subject of the second clause.' },
    { level: 3, name: '只有…才…', pattern: '只有 A，才 B', zh: '只有努力，才能学好汉语。', p: 'Zhǐyǒu nǔlì, cái néng xué hǎo Hànyǔ.', en: 'Only by working hard can you learn Chinese well.', note: '才 = “only then”, later than expected; 就 = “as soon as”, earlier than expected.' },
    { level: 3, name: '是…的 emphasis', pattern: 'Subject + 是 + time/place/manner + verb + 的', zh: '我是昨天来的。', p: 'Wǒ shì zuótiān lái de.', en: 'It was yesterday that I came.', note: 'For a completed action, 是…的 spotlights when, where or how it happened, not that it happened.' },
    { level: 3, name: '一…就…', pattern: '一 + verb 1 + 就 + verb 2', zh: '我一到家就睡觉。', p: 'Wǒ yí dào jiā jiù shuì jiào.', en: 'As soon as I get home I go to sleep.', note: 'The second action follows the first immediately.' },
    { level: 3, name: '先…然后…', pattern: '先 A，然后 B', zh: '我先吃饭，然后看书。', p: 'Wǒ xiān chī fàn, ránhòu kàn shū.', en: 'First I eat, then I read.', note: 'Sequence words: 先 … 然后 … 最后 (finally).' },
    { level: 3, name: 'Result complements', pattern: 'verb + 完 / 好 / 到 / 见', zh: '我吃完了。', p: 'Wǒ chī wán le.', en: 'I have finished eating.', note: 'A second syllable after the verb states the result: 完 finished, 好 done well, 到 reached, 见 perceived. Negate with 没: 没吃完.' },
    { level: 3, name: 'Duration with 了…了', pattern: 'verb + 了 + duration + (object) + 了', zh: '我学了三年汉语了。', p: 'Wǒ xué le sān nián Hànyǔ le.', en: 'I have been studying Chinese for three years (and still am).', note: 'Duration goes after the verb. The final 了 means the action continues up to now.' },
    { level: 3, name: '要…了 imminent', pattern: '(快) 要 + verb + 了', zh: '要下雨了。', p: 'Yào xià yǔ le.', en: 'It is about to rain.', note: '快要…了 / 就要…了 all mean “about to”.' },
    { level: 3, name: '比较 “relatively”', pattern: '比较 + adjective', zh: '这个比较贵。', p: 'Zhè ge bǐjiào guì.', en: 'This one is rather expensive.', note: 'A soft “quite / relatively”, with no explicit comparison.' },
    /* ---------- HSK 4 ---------- */
    { level: 4, name: '不但…而且…', pattern: '不但 A，而且 B', zh: '他不但会说汉语，而且说得很好。', p: 'Tā búdàn huì shuō Hànyǔ, érqiě shuō de hěn hǎo.', en: 'He not only speaks Chinese, he speaks it well.', note: '“Not only… but also”. 而且 can also stand alone as “moreover”.' },
    { level: 4, name: '即使…也…', pattern: '即使 A，也 B', zh: '即使下雨，我也要去。', p: 'Jíshǐ xià yǔ, wǒ yě yào qù.', en: 'Even if it rains, I will still go.', note: 'A concession about a hypothetical. For a real situation use 虽然…但是.' },
    { level: 4, name: '无论…都…', pattern: '无论 + question form，都 B', zh: '无论多忙，他都坚持锻炼。', p: 'Wúlùn duō máng, tā dōu jiānchí duànliàn.', en: 'No matter how busy he is, he keeps exercising.', note: '无论 / 不管 is followed by a question word or an A-not-A form, and the second clause takes 都 or 也.' },
    { level: 4, name: '只要…就…', pattern: '只要 A，就 B', zh: '只要你努力，就一定能成功。', p: 'Zhǐyào nǐ nǔlì, jiù yídìng néng chénggōng.', en: 'As long as you work hard, you will surely succeed.', note: '只要 = a sufficient condition (“as long as”); 只有…才 = a necessary one (“only if”).' },
    { level: 4, name: '既…又…', pattern: '既 A 又 B', zh: '这个办法既简单又有效。', p: 'Zhè ge bànfǎ jì jiǎndān yòu yǒuxiào.', en: 'This method is both simple and effective.', note: 'Two qualities of the same subject; more formal than 又…又….' },
    { level: 4, name: '连…都…', pattern: '连 + X + 都 / 也 + verb', zh: '他连一句话都没说。', p: 'Tā lián yí jù huà dōu méi shuō.', en: 'He did not say even one word.', note: 'Emphasis: “even X”. The 连 phrase moves before the verb.' },
    { level: 4, name: '把 with complement', pattern: '把 + object + verb + 到 / 在 / 给 …', zh: '请把这本书放在桌子上。', p: 'Qǐng bǎ zhè běn shū fàng zài zhuōzi shang.', en: 'Please put this book on the table.', note: '把 sentences always finish with what happened to the object: where it went (在/到), who got it (给), or how it ended up.' },
    { level: 4, name: 'Potential complements', pattern: 'verb + 得 / 不 + result', zh: '这个字我看得懂，那个字我看不懂。', p: 'Zhè ge zì wǒ kàn de dǒng, nà ge zì wǒ kàn bu dǒng.', en: 'I can read this character; I can’t read that one.', note: '得 in the middle = can; 不 in the middle = cannot. 看得见 / 看不见, 买得起 / 买不起, 来得及 / 来不及.' },
    { level: 4, name: 'Direction complements', pattern: 'verb + 上来 / 下去 / 出来 / 进去 / 过来 / 回去', zh: '他从楼上跑下来了。', p: 'Tā cóng lóushàng pǎo xiàlai le.', en: 'He ran down from upstairs.', note: '来 = toward the speaker, 去 = away. The object of a place goes between: 走进教室去.' },
    { level: 4, name: '越 A 越 B', pattern: '越 + A，越 + B', zh: '雨越下越大。', p: 'Yǔ yuè xià yuè dà.', en: 'The rain is getting heavier and heavier.', note: 'The more A, the more B. With one subject: 他越说越激动.' },
    { level: 4, name: '一…也不 / 也没', pattern: '一 + measure + noun + 也 / 都 + 不 / 没', zh: '我一个人也不认识。', p: 'Wǒ yí ge rén yě bú rènshi.', en: 'I don’t know a single person.', note: 'Total negation: “not even one”.' },
    { level: 4, name: '被 with 给', pattern: 'A + 被 / 让 / 叫 + B + 给 + verb', zh: '我的自行车让人给拿走了。', p: 'Wǒ de zìxíngchē ràng rén gěi ná zǒu le.', en: 'My bicycle got taken away by someone.', note: '让 and 叫 are colloquial passives; the extra 给 is common in speech and changes nothing.' },
    { level: 4, name: '是否 / 究竟 questions', pattern: '究竟 / 到底 + question', zh: '你到底想去哪儿？', p: 'Nǐ dàodǐ xiǎng qù nǎr?', en: 'Where on earth do you want to go?', note: '到底 / 究竟 press for a definite answer; never combine with 吗.' },
    { level: 4, name: '除非…否则…', pattern: '除非 A，否则 B', zh: '除非你去，否则我不去。', p: 'Chúfēi nǐ qù, fǒuzé wǒ bú qù.', en: 'Unless you go, I won’t go.', note: '除非 = unless; 否则 / 要不然 = otherwise.' },
    { level: 4, name: '对…来说', pattern: '对 + person + 来说', zh: '对我来说，发音最难。', p: 'Duì wǒ lái shuō, fāyīn zuì nán.', en: 'For me, pronunciation is the hardest.', note: 'Frames an opinion from someone’s point of view.' }
  ];
});
