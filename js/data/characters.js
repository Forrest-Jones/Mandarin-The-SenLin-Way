/* Mandarin The SenLin Way — characters, in learning order.
   h = hanzi, p = pinyin, m = meaning keyword, c = components (props),
   s = scene seed.  The app turns each seed into a full movie scene:
   "<ACTOR>, in <ROOM> of <SET>, <seed>".
   Phase 1 = HSK 1 (≈180 characters).  Add more objects to extend.        */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SENLIN_CHARACTERS = factory();
})(this, function () {
  'use strict';
  return [
    /* --- Day 1 of characters: the SenLin story --- */
    { h: '木', p: 'mù', m: 'tree', c: ['木'], s: 'plants a single TREE (木) and waters it — the first tree of your forest.' },
    { h: '林', p: 'lín', m: 'woods', c: ['木', '木'], s: 'stands between TWO TREES (木木) — a small grove: WOODS.' },
    { h: '森', p: 'sēn', m: 'forest', c: ['木', '木', '木'], s: 'is lost among THREE TREES stacked high (木木木) — a whole FOREST. 森林 sēnlín = forest.' },

    { h: '我', p: 'wǒ', m: 'I / me', c: ['扌', '戈'], s: 'grips a SPEAR (戈) in a gloved HAND (扌) and shouts “ME first!”' },
    { h: '你', p: 'nǐ', m: 'you', c: ['亻', '尔'], s: 'points a MANNEQUIN (亻) at a swinging CHANDELIER (尔): “YOU! Over there!”' },
    { h: '好', p: 'hǎo', m: 'good', c: ['女', '子'], s: 'watches a WOMAN (女) hug a CHILD (子) — everything is GOOD.' },

    { h: '是', p: 'shì', m: 'to be / yes', c: ['日', '正'], s: 'holds the SUN (日) over a CHECKMARK (正): “Yes, it IS correct.”' },
    { h: '不', p: 'bù', m: 'not', c: ['不'], s: 'waves a BIG RED X (不) and says “NOT today!”' },
    { h: '的', p: 'de', m: '’s (possessive)', c: ['白', '勺'], s: 'ties a WHITE FLAG (白) to a LADLE (勺) — the flag OF the ladle, the ’s.' },

    { h: '他', p: 'tā', m: 'he', c: ['亻', '也'], s: 'sees a MANNEQUIN (亻) stung by a SCORPION (也): “HE got stung!”' },
    { h: '她', p: 'tā', m: 'she', c: ['女', '也'], s: 'sees a WOMAN (女) flick a SCORPION (也) away: “SHE is fearless.”' },
    { h: '们', p: 'men', m: '(plural)', c: ['亻', '门'], s: 'pushes a crowd of MANNEQUINS (亻) through a SALOON DOOR (门) — the plural “-s”.' },

    { h: '很', p: 'hěn', m: 'very', c: ['彳', '艮'], s: 'marches in BOOTS (彳) beside a MULE (艮) that is VERY, very slow.' },
    { h: '也', p: 'yě', m: 'also', c: ['也'], s: 'is ALSO stung by the SCORPION (也) — “me too!”' },
    { h: '吗', p: 'ma', m: '? (question)', c: ['口', '马'], s: 'opens a GIANT MOUTH (口) to ask a HORSE with a SADDLE (马): “…?” — the spoken question mark.' },

    { h: '人', p: 'rén', m: 'person', c: ['人'], s: 'walks like a striding PERSON (人) — two legs, that is all a person is.' },
    { h: '中', p: 'zhōng', m: 'middle / China', c: ['口', '丨'], s: 'drives a POLE (丨) straight through the MIDDLE of a GIANT MOUTH (口).' },
    { h: '国', p: 'guó', m: 'country', c: ['囗', '玉'], s: 'locks a JADE GEM (玉) inside a FENCE (囗) — a COUNTRY guards its treasure.' },

    { h: '这', p: 'zhè', m: 'this', c: ['辶', '文'], s: 'walks in BOOTS (辶) toward a WRITTEN SIGN (文) that says “THIS way”.' },
    { h: '那', p: 'nà', m: 'that', c: ['刀', '二', '阝'], s: 'throws a KNIFE (刀) past TWO STICKS (二) at a far CITY GATE (阝): “THAT one, over there.”' },
    { h: '呢', p: 'ne', m: 'and…? (particle)', c: ['口', '尸', '匕'], s: 'asks with a GIANT MOUTH (口) from under a BED SHEET (尸), holding a SPOON (匕): “and you…?”' },

    { h: '什', p: 'shén', m: 'what (什么)', c: ['亻', '十'], s: 'asks a MANNEQUIN (亻) wearing a CROSS (十): “WHAT is that?”' },
    { h: '么', p: 'me', m: '(suffix of 什么)', c: ['丿', '厶'], s: 'cracks a WHIP (丿) at a NOSE (厶) — the tail end of “what”.' },
    { h: '哪', p: 'nǎ', m: 'which / where', c: ['口', '那'], s: 'shouts with a GIANT MOUTH (口) at a SIGNPOST (那): “WHICH one?!”' },

    { h: '一', p: 'yī', m: 'one', c: ['一'], s: 'lays ONE STICK (一) on the floor.' },
    { h: '二', p: 'èr', m: 'two', c: ['二'], s: 'lays TWO STICKS (二), one above the other.' },
    { h: '三', p: 'sān', m: 'three', c: ['三'], s: 'lays THREE STICKS (三) — a little ladder.' },

    { h: '四', p: 'sì', m: 'four', c: ['囗', '儿'], s: 'hides a PAIR OF LEGS (儿) inside a FENCE (囗) — FOUR walls, four legs.' },
    { h: '五', p: 'wǔ', m: 'five', c: ['五'], s: 'holds up an OPEN HAND (五): FIVE fingers spread.' },
    { h: '六', p: 'liù', m: 'six', c: ['亠', '八'], s: 'wears a TOP HAT (亠) over a MOUSTACHE (八) — a dapper SIX.' },

    { h: '七', p: 'qī', m: 'seven', c: ['七'], s: 'cuts a SEVEN shape into a cake with a HOOKED KNIFE (七).' },
    { h: '八', p: 'bā', m: 'eight', c: ['八'], s: 'strokes a big MOUSTACHE (八) — EIGHT is a moustache.' },
    { h: '九', p: 'jiǔ', m: 'nine', c: ['九'], s: 'swings a NINE-shaped GOLF CLUB (九).' },

    { h: '十', p: 'shí', m: 'ten', c: ['十'], s: 'carries a wooden CROSS (十) — TEN, like a Roman X stood upright.' },
    { h: '零', p: 'líng', m: 'zero', c: ['雨', '令'], s: 'stands under an UMBRELLA (雨) blowing a WHISTLE (令) — ZERO raindrops get through.' },
    { h: '个', p: 'gè', m: '(measure word)', c: ['人', '丨'], s: 'pushes a POLE (丨) under a PERSON (人) — ONE (measure word) person on a stick.' },

    { h: '学', p: 'xué', m: 'study', c: ['⺍', '冖', '子'], s: 'puts a CROWN OF DOTS (⺍) on a LID (冖) over a CHILD (子) who is STUDYING.' },
    { h: '生', p: 'shēng', m: 'life / be born', c: ['生'], s: 'watches a SPROUT (生) push out of the ground — LIFE is BORN.' },
    { h: '习', p: 'xí', m: 'practice', c: ['习'], s: 'PRACTICES flapping a single WING (习) again and again.' },

    { h: '老', p: 'lǎo', m: 'old', c: ['耂', '匕'], s: 'leans on a CANE (耂) and eats with a SPOON (匕) — OLD age.' },
    { h: '师', p: 'shī', m: 'teacher', c: ['刂', '一', '巾'], s: 'waves a SWORD (刂), then ONE STICK (一) and a TOWEL (巾) — the TEACHER cleans the sword.' },
    { h: '校', p: 'xiào', m: 'school', c: ['木', '亠', '父'], s: 'climbs a TREE (木) wearing a TOP HAT (亠) with FATHER’s PIPE (父) — SCHOOL drop-off.' },

    { h: '同', p: 'tóng', m: 'same', c: ['冂', '一', '口'], s: 'stands in a DOORFRAME (冂) with ONE STICK (一) and a GIANT MOUTH (口) — we speak with the SAME voice.' },
    { h: '大', p: 'dà', m: 'big', c: ['大'], s: 'grows into a GIANT (大) with arms spread wide: “BIG!”' },
    { h: '小', p: 'xiǎo', m: 'small', c: ['小'], s: 'shrinks to a tiny FIGURINE (小) — three little strokes.' },

    { h: '爸', p: 'bà', m: 'dad', c: ['父', '巴'], s: 'watches FATHER with his PIPE (父) wrestle a BOA (巴) — DAD the hero.' },
    { h: '妈', p: 'mā', m: 'mom', c: ['女', '马'], s: 'sees a WOMAN (女) leap into a SADDLE (马) — MOM the rider.' },
    { h: '子', p: 'zǐ', m: 'child / -zi', c: ['子'], s: 'shakes a BABY RATTLE (子) — a CHILD.' },

    { h: '儿', p: 'ér', m: 'son / -r', c: ['儿'], s: 'walks on a PAIR OF LEGS (儿) — a toddler learning to walk, a SON.' },
    { h: '女', p: 'nǚ', m: 'woman / female', c: ['女'], s: 'lifts a BRIDAL VEIL (女) — a WOMAN.' },
    { h: '朋', p: 'péng', m: 'friend', c: ['月', '月'], s: 'hangs two CRESCENT MOONS (月月) side by side — FRIENDS stick together.' },

    { h: '友', p: 'yǒu', m: 'friend', c: ['ナ', '又'], s: 'shakes a LEFT GLOVE (ナ) with a RUBBER HAND (又) — FRIENDSHIP.' },
    { h: '姐', p: 'jiě', m: 'older sister', c: ['女', '且'], s: 'sees a WOMAN (女) climb a SHELF (且) — OLDER SISTER reaches the top.' },
    { h: '先', p: 'xiān', m: 'first', c: ['丿', '土', '儿'], s: 'cracks a WHIP (丿) at a DIRT PILE (土) and a PAIR OF LEGS (儿) sprints off FIRST.' },

    { h: '在', p: 'zài', m: 'at / to be in', c: ['ナ', '土'], s: 'presses a LEFT GLOVE (ナ) into a DIRT PILE (土): “I am right HERE, AT this spot.”' },
    { h: '现', p: 'xiàn', m: 'present / now', c: ['王', '见'], s: 'puts on a CROWN (王) and BINOCULARS (见): “NOW I can see the PRESENT.”' },
    { h: '家', p: 'jiā', m: 'home / family', c: ['宀', '豕'], s: 'shelters a PIG (豕) under a ROOF (宀) — a farm HOME.' },

    { h: '有', p: 'yǒu', m: 'have', c: ['ナ', '月'], s: 'holds a SLAB OF MEAT (月) in a LEFT GLOVE (ナ): “I HAVE food!”' },
    { h: '没', p: 'méi', m: 'not have', c: ['氵', '几', '又'], s: 'sprays a WATER PISTOL (氵) over a SMALL TABLE (几) with a RUBBER HAND (又) — it is gone: NOT HAVE.' },
    { h: '了', p: 'le', m: '(completed)', c: ['了'], s: 'waves a CHECKERED FLAG (了) — done, FINISHED (completion marker).' },

    { h: '和', p: 'hé', m: 'and', c: ['禾', '口'], s: 'eats a WHEAT STALK (禾) with a GIANT MOUTH (口) — bread AND harmony.' },
    { h: '都', p: 'dōu', m: 'all / both', c: ['者', '阝'], s: 'leads an ELDER (者) to a CITY GATE (阝) — ALL of them enter.' },
    { h: '太', p: 'tài', m: 'too (much)', c: ['大', '丶'], s: 'is a GIANT (大) with a DROP (丶) of sweat: “TOO big, TOO hot!”' },

    { h: '天', p: 'tiān', m: 'sky / day', c: ['一', '大'], s: 'holds ONE STICK (一) above a GIANT’s head (大) — the SKY, a DAY.' },
    { h: '今', p: 'jīn', m: 'now / today', c: ['人', '一', '乛'], s: 'a PERSON (人) hangs ONE STICK (一) on a COAT HOOK (乛): TODAY’s coat, hung NOW.' },
    { h: '明', p: 'míng', m: 'bright / tomorrow', c: ['日', '月'], s: 'raises the SUN LAMP (日) and the CRESCENT MOON (月) together — BRIGHT, TOMORROW.' },

    { h: '昨', p: 'zuó', m: 'yesterday', c: ['日', '乍'], s: 'holds the SUN LAMP (日) up to a CLAPPER BOARD (乍): “Cut! That was YESTERDAY’s take.”' },
    { h: '年', p: 'nián', m: 'year', c: ['年'], s: 'flips a CALENDAR (年) through all twelve months — one YEAR.' },
    { h: '月', p: 'yuè', m: 'month / moon', c: ['月'], s: 'hangs a CRESCENT MOON (月) — one MONTH.' },

    { h: '日', p: 'rì', m: 'day / sun', c: ['日'], s: 'throws a blazing SUN LAMP (日) into the sky — one DAY.' },
    { h: '号', p: 'hào', m: 'number / date', c: ['口', '丂'], s: 'shouts through a GIANT MOUTH (口) down a BENT PIPE (丂) — a NUMBER echoes back.' },
    { h: '星', p: 'xīng', m: 'star', c: ['日', '生'], s: 'watches a SUN LAMP (日) give birth to a SPROUT (生) that glows — a STAR.' },

    { h: '期', p: 'qī', m: 'period (of time)', c: ['其', '月'], s: 'carries a BASKET (其) to the CRESCENT MOON (月) — a PERIOD of time, a week.' },
    { h: '时', p: 'shí', m: 'time / o’clock', c: ['日', '寸'], s: 'measures the SUN LAMP (日) with a RULER (寸) — TIME, o’clock.' },
    { h: '候', p: 'hòu', m: 'wait / time (时候)', c: ['亻', '丨', '矢'], s: 'a MANNEQUIN (亻) leans on a POLE (丨) waiting for an ARROW (矢) — WAITING for the right moment.' },

    { h: '上', p: 'shàng', m: 'up / on', c: ['上'], s: 'climbs UP a STEP STOOL (上).' },
    { h: '下', p: 'xià', m: 'down / under', c: ['下'], s: 'drops DOWN through a TRAPDOOR (下).' },
    { h: '午', p: 'wǔ', m: 'noon', c: ['午'], s: 'cracks the NOON WHIP (午) — midday.' },

    { h: '前', p: 'qián', m: 'front / before', c: ['丷', '一', '月', '刂'], s: 'wears HORNS (丷), balances ONE STICK (一), a CRESCENT MOON (月) and a SWORD (刂) — charging FORWARD, in FRONT.' },
    { h: '后', p: 'hòu', m: 'behind / after', c: ['厂', '一', '口'], s: 'hides BEHIND a CLIFF (厂) with ONE STICK (一) and a GIANT MOUTH (口) — AFTER, BEHIND.' },
    { h: '面', p: 'miàn', m: 'side / face', c: ['面'], s: 'holds up a FACE MASK (面) — a surface, a SIDE (also: noodles).' },

    { h: '里', p: 'lǐ', m: 'inside', c: ['田', '土'], s: 'digs a RICE FIELD (田) down into a DIRT PILE (土) — INSIDE.' },
    { h: '东', p: 'dōng', m: 'east', c: ['东'], s: 'watches a SUNRISE (东) behind a tree — EAST.' },
    { h: '西', p: 'xī', m: 'west', c: ['西'], s: 'watches a bird settle into a BIRD NEST (西) at sunset — WEST.' },

    { h: '北', p: 'běi', m: 'north', c: ['北'], s: 'spins a COMPASS (北) until it points NORTH.' },
    { h: '京', p: 'jīng', m: 'capital', c: ['京'], s: 'stands on the roof of a PAGODA (京) — the CAPITAL city.' },
    { h: '来', p: 'lái', m: 'come', c: ['一', '米'], s: 'waves a BAG OF RICE (米) under ONE STICK (一): “COME and eat!”' },

    { h: '去', p: 'qù', m: 'go', c: ['土', '厶'], s: 'kicks a DIRT PILE (土) with a NOSE (厶) turned away — “GO!”' },
    { h: '回', p: 'huí', m: 'return', c: ['囗', '口'], s: 'walks a GIANT MOUTH (口) in circles inside a FENCE (囗) — RETURN.' },
    { h: '出', p: 'chū', m: 'go out', c: ['山', '山'], s: 'climbs a MOUNTAIN (山) on top of a MOUNTAIN (山) — going OUT.' },

    { h: '看', p: 'kàn', m: 'look / watch', c: ['手', '目'], s: 'shades an EYEBALL (目) with a HAND (手) — LOOK.' },
    { h: '见', p: 'jiàn', m: 'see', c: ['见'], s: 'peers through BINOCULARS (见) — SEE.' },
    { h: '听', p: 'tīng', m: 'listen', c: ['口', '斤'], s: 'holds a GIANT MOUTH (口) next to an AXE (斤): “LISTEN to the chop.”' },

    { h: '说', p: 'shuō', m: 'speak', c: ['讠', '丷', '口', '儿'], s: 'speaks into a MICROPHONE (讠) wearing HORNS (丷), a GIANT MOUTH (口) and a PAIR OF LEGS (儿) — SPEAKING while running.' },
    { h: '读', p: 'dú', m: 'read', c: ['讠', '十', '买'], s: 'READS aloud into a MICROPHONE (讠) from a CROSS (十) painted on a SHOPPING CART (买).' },
    { h: '写', p: 'xiě', m: 'write', c: ['冖', '与'], s: 'hides under a LID (冖) with a GIFT BOX (与) — WRITING a card.' },

    { h: '话', p: 'huà', m: 'words / speech', c: ['讠', '舌'], s: 'speaks into a MICROPHONE (讠) with a wagging TONGUE (舌) — WORDS, speech.' },
    { h: '汉', p: 'hàn', m: 'Han / Chinese', c: ['氵', '又'], s: 'fires a WATER PISTOL (氵) with a RUBBER HAND (又) — the HAN river, Chinese.' },
    { h: '语', p: 'yǔ', m: 'language', c: ['讠', '五', '口'], s: 'speaks into a MICROPHONE (讠) with an OPEN HAND (五) and a GIANT MOUTH (口) — LANGUAGE.' },

    { h: '电', p: 'diàn', m: 'electricity', c: ['日', '乚'], s: 'catches the SUN LAMP (日) on a FISHHOOK (乚) — ELECTRICITY, lightning.' },
    { h: '视', p: 'shì', m: 'view (TV)', c: ['礻', '见'], s: 'props BINOCULARS (见) on an ALTAR (礻) — WATCHING TV.' },
    { h: '影', p: 'yǐng', m: 'shadow / movie', c: ['日', '京', '彡'], s: 'casts a shadow: SUN LAMP (日) over a PAGODA (京) with a WIG (彡) streaming — a MOVIE.' },

    { h: '脑', p: 'nǎo', m: 'brain', c: ['月', '亠', '凶'], s: 'opens a SLAB OF MEAT (月) under a TOP HAT (亠) and finds a BEAR TRAP (凶) — the BRAIN.' },
    { h: '书', p: 'shū', m: 'book', c: ['书'], s: 'opens a BOOK (书) — a brush writing on a scroll.' },
    { h: '字', p: 'zì', m: 'character / word', c: ['宀', '子'], s: 'places a BABY RATTLE (子) under a ROOF (宀) — a written CHARACTER.' },

    { h: '名', p: 'míng', m: 'name', c: ['夕', '口'], s: 'calls a NAME with a GIANT MOUTH (口) by LANTERN light (夕).' },
    { h: '叫', p: 'jiào', m: 'be called / shout', c: ['口', '丩'], s: 'SHOUTS with a GIANT MOUTH (口) tied to a TWISTED ROPE (丩) — is CALLED.' },
    { h: '认', p: 'rèn', m: 'recognize', c: ['讠', '人'], s: 'speaks into a MICROPHONE (讠) to a PERSON (人): “I RECOGNIZE you.”' },

    { h: '识', p: 'shí', m: 'know', c: ['讠', '口', '八'], s: 'speaks into a MICROPHONE (讠) through a GIANT MOUTH (口) with a MOUSTACHE (八) — KNOWLEDGE.' },
    { h: '会', p: 'huì', m: 'can / will', c: ['人', '云'], s: 'a PERSON (人) rides a CLOUD (云) — CAN, will, meeting.' },
    { h: '能', p: 'néng', m: 'be able', c: ['厶', '月', '匕', '匕'], s: 'juggles a NOSE (厶), a SLAB OF MEAT (月) and two SPOONS (匕匕) — an ABLE bear.' },

    { h: '想', p: 'xiǎng', m: 'think / want', c: ['木', '目', '心'], s: 'a TREE (木) with an EYEBALL (目) resting on a HEART PILLOW (心) — THINKING, wanting.' },
    { h: '喜', p: 'xǐ', m: 'joy / like', c: ['士', '口', '丷', '口'], s: 'a GRADUATION CAP (士) with a GIANT MOUTH (口), HORNS (丷) and another GIANT MOUTH (口) — laughing with JOY.' },
    { h: '欢', p: 'huān', m: 'happy', c: ['又', '欠'], s: 'a RUBBER HAND (又) tickles a YAWNING FACE (欠) into HAPPINESS.' },

    { h: '吃', p: 'chī', m: 'eat', c: ['口', '乞'], s: 'a GIANT MOUTH (口) holding a BEGGING BOWL (乞) — EAT.' },
    { h: '喝', p: 'hē', m: 'drink', c: ['口', '日', '勹', '人', '乚'], s: 'a GIANT MOUTH (口) under the SUN LAMP (日), WRAPPING PAPER (勹) around a PERSON (人) on a FISHHOOK (乚) — so thirsty: DRINK.' },
    { h: '饭', p: 'fàn', m: 'meal / rice', c: ['饣', '厂', '又'], s: 'a LUNCHBOX (饣) under a CLIFF (厂) grabbed by a RUBBER HAND (又) — a MEAL of RICE.' },

    { h: '水', p: 'shuǐ', m: 'water', c: ['水'], s: 'splashes through a STREAM (水) — WATER.' },
    { h: '茶', p: 'chá', m: 'tea', c: ['艹', '人', '木'], s: 'GRASS (艹) over a PERSON (人) sitting in a TREE (木) — picking TEA.' },
    { h: '菜', p: 'cài', m: 'vegetable / dish', c: ['艹', '爫', '木'], s: 'GRASS (艹) picked by CLAWS (爫) from a TREE (木) — VEGETABLES, a dish.' },

    { h: '米', p: 'mǐ', m: 'rice (grain)', c: ['米'], s: 'spills a BAG OF RICE (米) everywhere.' },
    { h: '果', p: 'guǒ', m: 'fruit', c: ['田', '木'], s: 'a RICE FIELD (田) growing on top of a TREE (木) — FRUIT.' },
    { h: '苹', p: 'píng', m: 'apple (苹果)', c: ['艹', '平'], s: 'GRASS (艹) pressed under a FLAT BOARD (平) — an APPLE orchard row.' },

    { h: '杯', p: 'bēi', m: 'cup', c: ['木', '不'], s: 'a TREE (木) carved with a BIG RED X (不) — a wooden CUP you must NOT drop.' },
    { h: '桌', p: 'zhuō', m: 'table', c: ['卜', '日', '木'], s: 'a FORTUNE STICK (卜) over a SUN LAMP (日) on a TREE (木) — a TABLE.' },
    { h: '椅', p: 'yǐ', m: 'chair', c: ['木', '大', '可'], s: 'a TREE (木) shaped like a GIANT (大) giving a THUMBS-UP (可) — a CHAIR.' },

    { h: '买', p: 'mǎi', m: 'buy', c: ['乛', '头'], s: 'a COAT HOOK (乛) holding a SKULL (头) — BUYing with your head.' },
    { h: '钱', p: 'qián', m: 'money', c: ['钅', '戋'], s: 'a GOLD BAR (钅) guarded by TWO CROSSED SPEARS (戋) — MONEY.' },
    { h: '块', p: 'kuài', m: 'yuan / lump', c: ['土', '夬'], s: 'a DIRT PILE (土) cut with an ARCHER’S RING (夬) — a LUMP, one yuan.' },

    { h: '多', p: 'duō', m: 'many / much', c: ['夕', '夕'], s: 'two LANTERNS (夕夕) glowing — MANY nights.' },
    { h: '少', p: 'shǎo', m: 'few / little', c: ['小', '丿'], s: 'a FIGURINE (小) sliced by a WHIP (丿) — FEW, less.' },
    { h: '几', p: 'jǐ', m: 'how many / a few', c: ['几'], s: 'counts the legs of a SMALL TABLE (几) — HOW MANY?' },

    { h: '分', p: 'fēn', m: 'minute / divide', c: ['八', '刀'], s: 'a MOUSTACHE (八) split by a KNIFE (刀) — DIVIDE, a minute.' },
    { h: '钟', p: 'zhōng', m: 'clock / o’clock', c: ['钅', '中'], s: 'a GOLD BAR (钅) struck on the BULLSEYE (中) — a CLOCK chimes.' },
    { h: '点', p: 'diǎn', m: 'o’clock / dot', c: ['卜', '口', '灬'], s: 'a FORTUNE STICK (卜) and a GIANT MOUTH (口) over a CAMPFIRE (灬) — a DOT, o’clock.' },

    { h: '工', p: 'gōng', m: 'work', c: ['工'], s: 'carries an I-BEAM (工) — WORK.' },
    { h: '作', p: 'zuò', m: 'do / make (工作)', c: ['亻', '乍'], s: 'a MANNEQUIN (亻) snaps a CLAPPER BOARD (乍) — DO, make.' },
    { h: '做', p: 'zuò', m: 'do / make', c: ['亻', '古', '攵'], s: 'a MANNEQUIN (亻) taps an ANTIQUE VASE (古) with a STICK (攵) — MAKE, do.' },

    { h: '打', p: 'dǎ', m: 'hit / play / make (call)', c: ['扌', '丁'], s: 'a GLOVE (扌) hammering a NAIL (丁) — HIT.' },
    { h: '开', p: 'kāi', m: 'open / drive', c: ['一', '廾'], s: 'ONE STICK (一) lifted by TWO RAISED HANDS (廾) — OPEN, start.' },
    { h: '住', p: 'zhù', m: 'live (reside)', c: ['亻', '主'], s: 'a MANNEQUIN (亻) beside a CANDLE (主) — LIVE, stay.' },

    { h: '坐', p: 'zuò', m: 'sit / take (transport)', c: ['人', '人', '土'], s: 'two PEOPLE (人人) on a DIRT PILE (土) — SIT.' },
    { h: '车', p: 'chē', m: 'vehicle', c: ['车'], s: 'rolls a TOY CAR (车) — a VEHICLE.' },
    { h: '租', p: 'zū', m: 'rent', c: ['禾', '且'], s: 'a WHEAT STALK (禾) on a SHELF (且) — RENT it by the day.' },

    { h: '飞', p: 'fēi', m: 'fly', c: ['飞'], s: 'flaps WINGS (飞) — FLY.' },
    { h: '机', p: 'jī', m: 'machine', c: ['木', '几'], s: 'a TREE (木) bolted to a SMALL TABLE (几) — a MACHINE.' },
    { h: '店', p: 'diàn', m: 'shop', c: ['广', '卜', '口'], s: 'a LEAN-TO (广) with a FORTUNE STICK (卜) and a GIANT MOUTH (口) — a SHOP.' },

    { h: '商', p: 'shāng', m: 'commerce', c: ['亠', '冂', '八', '口'], s: 'a TOP HAT (亠) over a DOORFRAME (冂), a MOUSTACHE (八) and a GIANT MOUTH (口) — a MERCHANT selling.' },
    { h: '医', p: 'yī', m: 'medicine / doctor', c: ['匚', '矢'], s: 'an ARROW (矢) in a BOX (匚) — the DOCTOR’s kit.' },
    { h: '院', p: 'yuàn', m: 'courtyard / institute', c: ['阝', '宀', '元'], s: 'a CITY GATE (阝) with a ROOF (宀) over a COIN (元) — a COURTYARD, a hospital.' },

    { h: '睡', p: 'shuì', m: 'sleep', c: ['目', '垂'], s: 'an EYEBALL (目) DROOPING like a WILTED FLOWER (垂) — SLEEP.' },
    { h: '觉', p: 'jiào', m: 'sleep (睡觉)', c: ['⺍', '冖', '见'], s: 'a CROWN OF DOTS (⺍) on a LID (冖) over BINOCULARS (见) — eyes closing, SLEEP.' },
    { h: '起', p: 'qǐ', m: 'rise / get up', c: ['走', '己'], s: 'RUNNING SHOES (走) beside a MIRROR (己) — GET UP, rise.' },

    { h: '对', p: 'duì', m: 'correct / towards', c: ['又', '寸'], s: 'a RUBBER HAND (又) holding a RULER (寸) — measured, CORRECT.' },
    { h: '请', p: 'qǐng', m: 'please / invite', c: ['讠', '青'], s: 'speaks into a MICROPHONE (讠) holding a JADE STONE (青) — PLEASE, invite.' },
    { h: '谢', p: 'xiè', m: 'thank', c: ['讠', '身', '寸'], s: 'speaks into a MICROPHONE (讠) with a bowing TORSO (身) and a RULER (寸) — THANKS.' },

    { h: '再', p: 'zài', m: 'again', c: ['一', '冂', '土'], s: 'ONE STICK (一), a DOORFRAME (冂) and a DIRT PILE (土) — go through AGAIN.' },
    { h: '关', p: 'guān', m: 'close / concern', c: ['丷', '天'], s: 'HORNS (丷) locking up the BLUE SKY CLOTH (天) — CLOSE, shut.' },
    { h: '系', p: 'xì', m: 'connect / system', c: ['丿', '糸'], s: 'a WHIP (丿) tied to SILK THREAD (糸) — a CONNECTION.' },

    { h: '客', p: 'kè', m: 'guest', c: ['宀', '夂', '口'], s: 'under a ROOF (宀), a WALKING STICK (夂) and a GIANT MOUTH (口) — a GUEST arrives.' },
    { h: '气', p: 'qì', m: 'air / spirit', c: ['气'], s: 'blows a PUFF OF AIR (气) — gas, weather, spirit.' },
    { h: '冷', p: 'lěng', m: 'cold', c: ['冫', '令'], s: 'ICE CUBES (冫) and a WHISTLE (令) — shivering, COLD.' },

    { h: '热', p: 'rè', m: 'hot', c: ['扌', '丸', '灬'], s: 'a GLOVE (扌) holding a PILL (丸) over a CAMPFIRE (灬) — HOT.' },
    { h: '高', p: 'gāo', m: 'tall / high', c: ['亠', '口', '冂', '口'], s: 'a TOP HAT (亠) on a GIANT MOUTH (口) on a DOORFRAME (冂) on a GIANT MOUTH (口) — a TALL tower.' },
    { h: '兴', p: 'xìng', m: 'excitement (高兴)', c: ['⺍', '一', '八'], s: 'a CROWN OF DOTS (⺍) over ONE STICK (一) and a MOUSTACHE (八) — jumping with EXCITEMENT.' },

    { h: '漂', p: 'piào', m: 'pretty (漂亮)', c: ['氵', '覀', '示'], s: 'a WATER PISTOL (氵) under a BIRDCAGE (覀) on an ALTAR STONE (示) — PRETTY.' },
    { h: '亮', p: 'liàng', m: 'bright', c: ['亠', '口', '冖', '几'], s: 'a TOP HAT (亠), a GIANT MOUTH (口), a LID (冖) and a SMALL TABLE (几) — a BRIGHT lamp.' },
    { h: '爱', p: 'ài', m: 'love', c: ['爫', '冖', '友'], s: 'CLAWS (爫) over a LID (冖) over a FRIENDSHIP BRACELET (友) — LOVE.' },

    { h: '怎', p: 'zěn', m: 'how', c: ['乍', '心'], s: 'a CLAPPER BOARD (乍) on a HEART PILLOW (心) — HOW?' },
    { h: '样', p: 'yàng', m: 'kind / way', c: ['木', '羊'], s: 'a TREE (木) beside a SHEEP (羊) — what KIND, what WAY.' },
    { h: '谁', p: 'shéi', m: 'who', c: ['讠', '隹'], s: 'speaks into a MICROPHONE (讠) at a FAT SPARROW (隹): “WHO are you?”' },

    { h: '些', p: 'xiē', m: 'some', c: ['止', '匕', '二'], s: 'a STOP SIGN (止), a SPOON (匕) and TWO STICKS (二) — SOME.' },
    { h: '岁', p: 'suì', m: 'years old', c: ['山', '夕'], s: 'a MOUNTAIN (山) lit by a LANTERN (夕) — YEARS of age.' },
    { h: '本', p: 'běn', m: 'root / (books)', c: ['木', '一'], s: 'a TREE (木) with ONE STICK (一) at its root — a ROOT, a volume of books.' },

    { h: '衣', p: 'yī', m: 'clothes', c: ['衣'], s: 'puts on a COAT (衣) — CLOTHES.' },
    { h: '服', p: 'fú', m: 'clothes / serve', c: ['月', '卩', '又'], s: 'a SLAB OF MEAT (月), a STAMP (卩) and a RUBBER HAND (又) — CLOTHES, to serve.' },
    { h: '猫', p: 'māo', m: 'cat', c: ['犭', '艹', '田'], s: 'a DOG LEASH (犭) dragged through GRASS (艹) in a RICE FIELD (田) — by a CAT.' },

    { h: '狗', p: 'gǒu', m: 'dog', c: ['犭', '勹', '口'], s: 'a DOG LEASH (犭) with WRAPPING PAPER (勹) around a GIANT MOUTH (口) — a DOG.' },
    { h: '雨', p: 'yǔ', m: 'rain', c: ['雨'], s: 'opens an UMBRELLA (雨) — RAIN.' },
    { h: '喂', p: 'wèi', m: 'hello (phone)', c: ['口', '田', '衣'], s: 'a GIANT MOUTH (口) shouting across a RICE FIELD (田) at a COAT (衣): “HELLO? (on the phone)”' }
  ];
});
