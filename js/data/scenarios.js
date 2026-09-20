/* Mandarin The SenLin Way — live 1-on-1 conversation scenarios for the AI tutor.
   minLevel = the HSK level from which the scenario is recommended.
   opener = the tutor's first line (so a session starts instantly). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SENLIN_SCENARIOS = factory();
})(this, function () {
  'use strict';
  return [
    { id: 'intro', minLevel: 1, title: '自我介绍', en: 'Introduce yourself', persona: '王丽 (Wáng Lì), a friendly new classmate', setting: 'the first day of a Chinese class', goal: 'Say your name, where you are from, and ask the same back.',
      opener: { zh: '你好！我叫王丽。你叫什么名字？', p: 'Nǐ hǎo! Wǒ jiào Wáng Lì. Nǐ jiào shénme míngzi?', en: 'Hello! I am Wang Li. What is your name?' } },
    { id: 'cafe', minLevel: 2, title: '在咖啡馆', en: 'Order at a café', persona: 'a cheerful café server', setting: 'a small café in Beijing', goal: 'Order a drink and something to eat, ask the price, and pay.',
      opener: { zh: '欢迎光临！您想喝点什么？', p: 'Huānyíng guānglín! Nín xiǎng hē diǎn shénme?', en: 'Welcome! What would you like to drink?' } },
    { id: 'directions', minLevel: 2, title: '问路', en: 'Ask for directions', persona: 'a helpful passer-by', setting: 'a busy street', goal: 'Find out how to get to the train station and how long it takes.',
      opener: { zh: '你好，你看起来在找什么。需要帮忙吗？', p: 'Nǐ hǎo, nǐ kànqǐlái zài zhǎo shénme. Xūyào bāngmáng ma?', en: 'Hi, you look like you are looking for something. Need help?' } },
    { id: 'shopping', minLevel: 2, title: '买东西', en: 'Shopping and bargaining', persona: 'a market stall owner', setting: 'a clothes market', goal: 'Ask about size and colour, ask the price, and bargain it down.',
      opener: { zh: '老板娘在这儿！你想买什么？这件衣服很漂亮。', p: 'Lǎobǎnniáng zài zhèr! Nǐ xiǎng mǎi shénme? Zhè jiàn yīfu hěn piàoliang.', en: 'The boss is here! What do you want to buy? This piece is very pretty.' } },
    { id: 'taxi', minLevel: 2, title: '坐出租车', en: 'Take a taxi', persona: 'a chatty taxi driver', setting: 'a taxi at the airport', goal: 'Tell the driver where to go, ask how long it takes, and make small talk.',
      opener: { zh: '你好，去哪儿？', p: 'Nǐ hǎo, qù nǎr?', en: 'Hello, where to?' } },
    { id: 'doctor', minLevel: 3, title: '看医生', en: 'At the doctor', persona: 'a calm doctor', setting: 'a clinic', goal: 'Describe your symptoms, answer the doctor’s questions, and understand the advice.',
      opener: { zh: '请坐。你哪儿不舒服？', p: 'Qǐng zuò. Nǐ nǎr bù shūfu?', en: 'Please sit. Where does it hurt?' } },
    { id: 'hotel', minLevel: 3, title: '酒店入住', en: 'Hotel check-in', persona: 'a hotel receptionist', setting: 'a hotel lobby', goal: 'Check in, ask about breakfast and wifi, and report a small problem with the room.',
      opener: { zh: '晚上好，欢迎入住。请问您有预订吗？', p: 'Wǎnshang hǎo, huānyíng rùzhù. Qǐngwèn nín yǒu yùdìng ma?', en: 'Good evening, welcome. Do you have a reservation?' } },
    { id: 'plans', minLevel: 3, title: '约朋友', en: 'Make plans with a friend', persona: '小明 (Xiǎo Míng), an old friend', setting: 'a phone call', goal: 'Suggest a time and place to meet this weekend and agree on the details.',
      opener: { zh: '喂？是我，小明！这个周末你有空吗？', p: 'Wéi? Shì wǒ, Xiǎo Míng! Zhè ge zhōumò nǐ yǒu kòng ma?', en: 'Hello? It’s me, Xiao Ming! Are you free this weekend?' } },
    { id: 'interview', minLevel: 4, title: '面试', en: 'Job interview', persona: 'a hiring manager at a tech company', setting: 'an interview room', goal: 'Introduce your background, explain why you want the job, and ask two questions.',
      opener: { zh: '你好，请坐。先简单介绍一下你自己吧。', p: 'Nǐ hǎo, qǐng zuò. Xiān jiǎndān jièshào yíxià nǐ zìjǐ ba.', en: 'Hello, please sit. First, briefly introduce yourself.' } },
    { id: 'news', minLevel: 5, title: '聊新闻', en: 'Discuss the news', persona: 'a well-read colleague', setting: 'a lunch break', goal: 'Talk about a recent story, give your opinion, and ask for theirs.',
      opener: { zh: '你最近看新闻了吗？有什么让你印象深刻的事？', p: 'Nǐ zuìjìn kàn xīnwén le ma? Yǒu shénme ràng nǐ yìnxiàng shēnkè de shì?', en: 'Have you read the news lately? Anything that left an impression?' } },
    { id: 'debate', minLevel: 6, title: '辩论', en: 'Debate an opinion', persona: 'a sharp but polite debate partner', setting: 'a university debate club', goal: 'Defend a position on a social topic with reasons and examples, and respond to counter-arguments.',
      opener: { zh: '今天的题目是：人工智能会让人类的生活更好吗？你先说说你的看法。', p: 'Jīntiān de tímù shì: réngōng zhìnéng huì ràng rénlèi de shēnghuó gèng hǎo ma? Nǐ xiān shuōshuo nǐ de kànfǎ.', en: 'Today’s topic: will AI make human life better? Give your view first.' } },
    { id: 'free', minLevel: 1, title: '自由聊天', en: 'Free talk', persona: '森林老师 (Sēnlín lǎoshī), your tutor', setting: 'anywhere you like', goal: 'Talk about your day, your plans, anything. The tutor follows your lead.',
      opener: { zh: '你好！今天想聊什么？', p: 'Nǐ hǎo! Jīntiān xiǎng liáo shénme?', en: 'Hi! What do you want to talk about today?' } }
  ];
});
