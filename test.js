// 账单工具解析逻辑测试：提取 index.html 内嵌 JS，mock DOM 后跑真实代码
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('未找到 script'); process.exit(1); }
let code = m[1];

// mock document / navigator
const elements = {};
const doc = {
  getElementById(id) {
    if (!elements[id]) {
      elements[id] = { value: '', textContent: '', classList: { add() {}, remove() {}, contains() { return false; } }, scrollIntoView() {}, focus() {} };
    }
    return elements[id];
  },
  createElement() { return { value: '', select() {}, textContent: '' }; },
  body: { appendChild() {}, removeChild() {} },
  execCommand() { return true; }
};
const navigatorMock = {};

// mock localStorage
const storage = {};
global.localStorage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem(k, v) { storage[k] = String(v); },
  removeItem(k) { delete storage[k]; }
};

const fn = new Function('document', 'navigator', code + '\n;return {generate, parseInput, resolveItem};');
const api = fn(doc, navigatorMock);
api.saveCustomList = () => {}; // 自助价目表已移除，pre 钩子置空避免报错（韭菜春卷等已并入内置价目表）

function runCase(name, text, expect) {
  const res = api.parseInput(text);
  // 合并计算
  const merged = {};
  for (const it of res.items) {
    const key = it.item.series + '|' + it.item.name + '|' + it.item.unit;
    if (!merged[key]) merged[key] = { name: it.item.name, qty: 0, unit: it.item.unit, series: it.item.series };
    merged[key].qty += it.qty;
  }
  const lines = [];
  let total = 0;
  for (const k in merged) {
    const o = merged[k];
    const amt = Math.round(PRICE(o) * o.qty * 100) / 100;
    total += amt;
    lines.push(`${o.series}|${o.name} ${o.qty}${o.unit} ¥${fmt(amt)}`);
  }
  const ok = JSON.stringify(lines.slice().sort()) === JSON.stringify(expect.lines.slice().sort()) && total === expect.total && JSON.stringify(res.unknown.map(u => u.name + (u.qty !== null ? ':' + u.qty : ''))) === JSON.stringify(expect.unknown || []);
  console.log((ok ? '✅' : '❌') + ' ' + name);
  if (!ok) {
    console.log('   got lines: ', JSON.stringify(lines));
    console.log('   got total: ', total);
    console.log('   got unknown:', JSON.stringify(res.unknown));
    console.log('   want lines: ', JSON.stringify(expect.lines));
    console.log('   want total: ', expect.total);
  }
  return ok;
}

// 内部函数需要 PRICE 映射（从代码里取，这里直接用 api 里的价格逻辑重算）
// 为简化，直接从 PRICES 常量计算——但它在闭包里，这里重新定义一个获取方式：
function priceFor(item) {
  const PRICES = { wumiguo: { "韭菜味": 8, "菜脯味": 10, "土豆味": 10, "玉米味": 10, "南瓜味": 10, "红萝卜": 10, "香芋味": 12, "紫薯味": 11, "竹笋味": 11, "芋泥咸蛋味": 12 },
    shuijingqiu: { "芋泥": 12, "红豆": 12, "紫薯": 12, "准山": 12, "奶黄": 12, "香芋": 12, "玉米": 12, "菜脯": 12, "韭菜": 12, "红萝卜": 12, "木耳": 12, "竹笋": 12 },
    others: { "香芋条": 12, "土豆条": 12, "蔬菜春卷": 16, "芋泥春卷": 16, "粿肉": 22, "韭黄虎皮卷": 22, "韭黄虾卷": 25, "虾饺": 22, "香芋饼": 14, "土豆饼": 14, "萝卜饼": 14, "菜头丸": 11, "小南瓜芋泥": 13, "紫菜卷": 22, "红桃粿": 2.5, "辣椒水": 8, "小米": 12, "小土豆": 12, "小桃粿": 14, "韭菜春卷": 17, "海丰小米": 12, "菜粿": 12, "三角虾酥": 12, "墨鱼虾排": 16, "辣椒酱": 35, "生紫菜卷": 16 } };
  return PRICES[item.series][item.name];
}
function PRICE(item) { return priceFor(item); }
function fmt(n) { return Math.round(n) === n ? String(n) : n.toFixed(2); }

let pass = 0, fail = 0;
const cases = [
  { name: '账单1 无米粿+菜头丸(694)', text: '无米粿：韭菜30、萝卜干8、竹笋8、菜头丸26\n陈思婷',
    expect: { total: 694, lines: ['wumiguo|韭菜味 30斤 ¥240', 'wumiguo|菜脯味 8斤 ¥80', 'wumiguo|竹笋味 8斤 ¥88', 'others|菜头丸 26斤 ¥286'], unknown: [] } },
  { name: '账单2 示例(650)', text: '韭菜20 紫菜卷15 菜脯10 咸蛋黄5',
    expect: { total: 650, lines: ['wumiguo|韭菜味 20斤 ¥160', 'wumiguo|菜脯味 10斤 ¥100', 'wumiguo|芋泥咸蛋味 5斤 ¥60', 'others|紫菜卷 15卷 ¥330'], unknown: [] } },
  { name: '账单3 各2斤(102)', text: '韭菜 菜谱 竹笋 芋泥咸蛋黄 玉米\n各2斤\n深圳市福田区福田街道福田社区福田村贝底田坊22号福庆街55号铺 13432864225 苏先生',
    expect: { total: 102, lines: ['wumiguo|韭菜味 2斤 ¥16', 'wumiguo|菜脯味 2斤 ¥20', 'wumiguo|竹笋味 2斤 ¥22', 'wumiguo|芋泥咸蛋味 2斤 ¥24', 'wumiguo|玉米味 2斤 ¥20'], unknown: [] } },
  { name: '账单4 猪脚圈(532)', text: '无米果\n韭菜10\n菜脯4标\n芋泥4标\n土豆4标\n竹笋4标\n紫薯2\n芋头4标\n猪脚圈\n芋头士豆菜脯各5',
    expect: { total: 532, lines: ['wumiguo|韭菜味 10斤 ¥80', 'wumiguo|菜脯味 4斤 ¥40', 'wumiguo|芋泥咸蛋味 4斤 ¥48', 'wumiguo|土豆味 4斤 ¥40', 'wumiguo|竹笋味 4斤 ¥44', 'wumiguo|紫薯味 2斤 ¥22', 'wumiguo|香芋味 4斤 ¥48', 'others|香芋饼 5斤 ¥70', 'others|土豆饼 5斤 ¥70', 'others|萝卜饼 5斤 ¥70'], unknown: [] } },
  { name: '账单5 包+粿肉(580)', text: '韭菜无米粿10包，芋泥无米粿5包，粿肉20斤',
    expect: { total: 580, lines: ['wumiguo|韭菜味 10斤 ¥80', 'wumiguo|芋泥咸蛋味 5斤 ¥60', 'others|粿肉 20斤 ¥440'], unknown: [] } },
  { name: '账单6 紫菜卷+虎皮(490)', text: '紫菜卷10  韭菜无米粿15  菜脯7 咸蛋黄3  虎皮韭黄2',
    expect: { total: 490, lines: ['wumiguo|韭菜味 15斤 ¥120', 'wumiguo|菜脯味 7斤 ¥70', 'wumiguo|芋泥咸蛋味 3斤 ¥36', 'others|紫菜卷 10卷 ¥220', 'others|韭黄虎皮卷 2斤 ¥44'], unknown: [] } },
  { name: '账单7 星号+菜头饼(360)', text: '无米粿 韭菜*2，菜脯*3，菜头丸*26，菜头饼*2\n黄丽敏',
    expect: { total: 360, lines: ['wumiguo|韭菜味 2斤 ¥16', 'wumiguo|菜脯味 3斤 ¥30', 'others|菜头丸 26斤 ¥286', 'others|萝卜饼 2斤 ¥28'], unknown: [] } },
  { name: '账单8 虎皮卷虾饺紫薯(550 新规则)', text: '虎皮卷10斤，虾饺10斤，紫薯10斤',
    expect: { total: 550, lines: ['others|韭黄虎皮卷 10斤 ¥220', 'others|虾饺 10斤 ¥220', 'wumiguo|紫薯味 10斤 ¥110'], unknown: [] } },
  { name: '账单9 粘连输入(韭菜30)', text: '无米粿30韭菜真空\n朱波',
    expect: { total: 240, lines: ['wumiguo|韭菜味 30斤 ¥240'], unknown: [] } },
  { name: '账单10 辣椒水(新增)', text: '辣椒水1斤\n韭菜5',
    expect: { total: 48, lines: ['others|辣椒水 1斤 ¥8', 'wumiguo|韭菜味 5斤 ¥40'], unknown: [] } },
  { name: '账单11 内置新品类(韭菜春卷17)手动输入', text: '韭菜春卷 1',
    expect: { total: 17, lines: ['others|韭菜春卷 1斤 ¥17'], unknown: [] } },
  { name: '账单14 小米(12/斤)', text: '小米2斤',
    pre: () => api.saveCustomList([]),
    expect: { total: 24, lines: ['others|小米 2斤 ¥24'], unknown: [] } },
  { name: '账单15 香芋条/土豆条按条+芋头条别名', text: '香芋条2条 土豆条3条 芋头条1条',
    pre: () => api.saveCustomList([]),
    expect: { total: 72, lines: ['others|香芋条 3条 ¥36', 'others|土豆条 3条 ¥36'], unknown: [] } },
  { name: '账单16 混合(小米+条类)', text: '小米1斤 香芋条1条 土豆条1条 芋头条1条',
    pre: () => api.saveCustomList([]),
    expect: { total: 48, lines: ['others|香芋条 2条 ¥24', 'others|土豆条 1条 ¥12', 'others|小米 1斤 ¥12'], unknown: [] } },
  { name: '账单17 水晶粉粿(口味在前粘连)', text: '韭菜水晶粉粿5',
    pre: () => api.saveCustomList([]),
    expect: { total: 60, lines: ['shuijingqiu|韭菜 5斤 ¥60'], unknown: [] } },
  { name: '账单18 水晶粉粿(口味在后粘连)', text: '水晶粉粿韭菜5',
    pre: () => api.saveCustomList([]),
    expect: { total: 60, lines: ['shuijingqiu|韭菜 5斤 ¥60'], unknown: [] } },
  { name: '账单19 水晶粉粿(空格分隔)', text: '水晶粉粿 韭菜5',
    pre: () => api.saveCustomList([]),
    expect: { total: 60, lines: ['shuijingqiu|韭菜 5斤 ¥60'], unknown: [] } },
  { name: '账单20 水晶粉粿(壳在前数字在后)', text: '韭菜 水晶粉粿 5',
    pre: () => api.saveCustomList([]),
    expect: { total: 60, lines: ['shuijingqiu|韭菜 5斤 ¥60'], unknown: [] } },
  { name: '账单21 水晶粉粿无口味(提示)', text: '水晶粉粿5',
    pre: () => api.saveCustomList([]),
    expect: { total: 0, lines: [], unknown: ['水晶粉粿(缺口味名):5'] } },
  { name: '账单22 无米粿(括号)写法', text: '无米粿（韭菜）3斤 菜脯2',
    pre: () => api.saveCustomList([]),
    expect: { total: 44, lines: ['wumiguo|韭菜味 3斤 ¥24', 'wumiguo|菜脯味 2斤 ¥20'], unknown: [] } },
  { name: '账单23 用户新订单(381 水晶粉粿标题行)', text: '无米粿（韭菜）3斤\n水晶粉粿\n香芋2斤\n韭菜4斤\n菜脯7斤\n小米10斤\n红桃粿10个\n香芋条1条\n虾饺2斤',
    pre: () => api.saveCustomList([]),
    expect: { total: 381, lines: ['wumiguo|韭菜味 3斤 ¥24', 'shuijingqiu|香芋 2斤 ¥24', 'shuijingqiu|菜脯 7斤 ¥84', 'shuijingqiu|韭菜 4斤 ¥48', 'others|小米 10斤 ¥120', 'others|红桃粿 10个 ¥25', 'others|香芋条 1条 ¥12', 'others|虾饺 2斤 ¥44'], unknown: [] } },
  { name: '账单25 水晶球标题行后切回无米粿', text: '水晶粉粿\n香芋2斤\n无米粿 韭菜3',
    pre: () => api.saveCustomList([]),
    expect: { total: 48, lines: ['shuijingqiu|香芋 2斤 ¥24', 'wumiguo|韭菜味 3斤 ¥24'], unknown: [] } },
  { name: '账单24 未知品名防错位', text: '咖喱粿2斤 韭菜3',
    pre: () => api.saveCustomList([]),
    expect: { total: 24, lines: ['wumiguo|韭菜味 3斤 ¥24'], unknown: ['咖喱粿:2'] } },
  { name: '账单26 紫薯边界(标题行下按水晶球12)', text: '水晶粉粿\n紫薯2斤',
    pre: () => api.saveCustomList([]),
    expect: { total: 24, lines: ['shuijingqiu|紫薯 2斤 ¥24'], unknown: [] } },
  { name: '账单27 紫薯边界(无标题按无米粿11)', text: '紫薯2斤',
    pre: () => api.saveCustomList([]),
    expect: { total: 22, lines: ['wumiguo|紫薯味 2斤 ¥22'], unknown: [] } },
  { name: '账单28 带系列后缀+分隔线', text: '无米粿系列\n韭菜味 12\n菜脯味 7\n香芋味 11\n---------\n粿肉 8\n---------\n林伟棚',
    pre: () => api.saveCustomList([]),
    expect: { total: 474, lines: ['wumiguo|韭菜味 12斤 ¥96', 'wumiguo|菜脯味 7斤 ¥70', 'wumiguo|香芋味 11斤 ¥132', 'others|粿肉 8斤 ¥176'], unknown: [] } },
  { name: '账单29 括号内多口味+菜头丸(628)', text: '无米粿（韭菜30，竹笋8，菜脯8），菜头丸20',
    pre: () => api.saveCustomList([]),
    expect: { total: 628, lines: ['wumiguo|韭菜味 30斤 ¥240', 'wumiguo|竹笋味 8斤 ¥88', 'wumiguo|菜脯味 8斤 ¥80', 'others|菜头丸 20斤 ¥220'], unknown: [] } },
  { name: '账单30 数字+斤+品名在前(70)', text: '5斤韭菜 3斤菜谱',
    pre: () => api.saveCustomList([]),
    expect: { total: 70, lines: ['wumiguo|韭菜味 5斤 ¥40', 'wumiguo|菜脯味 3斤 ¥30'], unknown: [] } },
  { name: '账单31 逗号分隔末尾逗号(350)', text: '韭菜16，菜脯9，香芋6，土豆6，',
    pre: () => api.saveCustomList([]),
    expect: { total: 350, lines: ['wumiguo|韭菜味 16斤 ¥128', 'wumiguo|菜脯味 9斤 ¥90', 'wumiguo|香芋味 6斤 ¥72', 'wumiguo|土豆味 6斤 ¥60'], unknown: [] } },
  { name: '账单32 品名+数字斤(368)', text: '蔬菜春卷 5斤\n芋泥春卷 5斤\n香芋饼 5斤\n菜头丸 6斤\n韭菜无米果 9斤',
    pre: () => api.saveCustomList([]),
    expect: { total: 368, lines: ['others|蔬菜春卷 5斤 ¥80', 'others|芋泥春卷 5斤 ¥80', 'others|香芋饼 5斤 ¥70', 'others|菜头丸 6斤 ¥66', 'wumiguo|韭菜味 9斤 ¥72'], unknown: [] } },
  { name: '账单33 句号分隔(282)', text: '韭菜22。菜谱4。菜头丸6',
    pre: () => api.saveCustomList([]),
    expect: { total: 282, lines: ['wumiguo|韭菜味 22斤 ¥176', 'wumiguo|菜脯味 4斤 ¥40', 'others|菜头丸 6斤 ¥66'], unknown: [] } },
  { name: '账单34 各1斤带句号(102)', text: '韭菜，香芋，咸蛋黄，萝卜饼，粿肉，虎皮卷，芋头条各1斤。',
    pre: () => api.saveCustomList([]),
    expect: { total: 102, lines: ['wumiguo|韭菜味 1斤 ¥8', 'wumiguo|香芋味 1斤 ¥12', 'wumiguo|芋泥咸蛋味 1斤 ¥12', 'others|萝卜饼 1斤 ¥14', 'others|粿肉 1斤 ¥22', 'others|韭黄虎皮卷 1斤 ¥22', 'others|香芋条 1条 ¥12'], unknown: [] } },
  { name: '账单35 系列+斤+顾客名苏生(264)', text: '无米果系列\n韭菜22斤，\n玉米2斤，\n香芋4斤，\n土豆2斤，\n苏生',
    pre: () => api.saveCustomList([]),
    expect: { total: 264, lines: ['wumiguo|韭菜味 22斤 ¥176', 'wumiguo|玉米味 2斤 ¥20', 'wumiguo|香芋味 4斤 ¥48', 'wumiguo|土豆味 2斤 ¥20'], unknown: [] } },
  { name: '账单36 无米粿韭菜+萝卜干+吴先森(628)', text: '无米粿韭菜30 萝卜干8 竹笋8 菜头丸20\n吴先森',
    pre: () => api.saveCustomList([]),
    expect: { total: 628, lines: ['wumiguo|韭菜味 30斤 ¥240', 'wumiguo|菜脯味 8斤 ¥80', 'wumiguo|竹笋味 8斤 ¥88', 'others|菜头丸 20斤 ¥220'], unknown: [] } },
  { name: '账单37 无米果冒号+逗号(625)', text: '无米果：韭菜25，菜脯15，竹笋15，菜头丸10',
    pre: () => api.saveCustomList([]),
    expect: { total: 625, lines: ['wumiguo|韭菜味 25斤 ¥200', 'wumiguo|菜脯味 15斤 ¥150', 'wumiguo|竹笋味 15斤 ¥165', 'others|菜头丸 10斤 ¥110'], unknown: [] } },
  { name: '账单38 昌岗店店名不抢数字(604)', text: '昌岗店\n无米粿韭菜30 ，萝卜干10，竹笋10，菜头丸14',
    pre: () => api.saveCustomList([]),
    expect: { total: 604, lines: ['wumiguo|韭菜味 30斤 ¥240', 'wumiguo|菜脯味 10斤 ¥100', 'wumiguo|竹笋味 10斤 ¥110', 'others|菜头丸 14斤 ¥154'], unknown: [] } },
  { name: '账单39 未知品名紧跟数字归它(24)', text: '牛肉丸 2斤 韭菜 3',
    pre: () => api.saveCustomList([]),
    expect: { total: 24, lines: ['wumiguo|韭菜味 3斤 ¥24'], unknown: ['牛肉丸:2'] } },
  { name: '账单40 标题行+咸蛋黄鲜笋紫薯(460)', text: '无米粿\n韭菜15\n咸蛋黄10\n香芋5\n鲜笋5\n菜脯5\n紫薯5',
    pre: () => api.saveCustomList([]),
    expect: { total: 460, lines: ['wumiguo|韭菜味 15斤 ¥120', 'wumiguo|芋泥咸蛋味 10斤 ¥120', 'wumiguo|香芋味 5斤 ¥60', 'wumiguo|竹笋味 5斤 ¥55', 'wumiguo|菜脯味 5斤 ¥50', 'wumiguo|紫薯味 5斤 ¥55'], unknown: [] } },
  { name: '账单41 空格分隔三项(266)', text: '韭菜 20 菜脯 4 菜头丸 6',
    pre: () => api.saveCustomList([]),
    expect: { total: 266, lines: ['wumiguo|韭菜味 20斤 ¥160', 'wumiguo|菜脯味 4斤 ¥40', 'others|菜头丸 6斤 ¥66'], unknown: [] } },
  { name: '账单42 带斤+分隔线+顾客名林伟棚(568)', text: '无米粿系列\n韭菜味 12斤 \n菜脯味 7斤 \n香芋味 6斤 \n---------\n粿肉 15斤 \n---------\n林伟棚',
    pre: () => api.saveCustomList([]),
    expect: { total: 568, lines: ['wumiguo|韭菜味 12斤 ¥96', 'wumiguo|菜脯味 7斤 ¥70', 'wumiguo|香芋味 6斤 ¥72', 'others|粿肉 15斤 ¥330'], unknown: [] } },
  { name: '账单43 逗号+蛋黄(282)', text: '菜脯7斤，蛋黄7斤，韭菜16',
    pre: () => api.saveCustomList([]),
    expect: { total: 282, lines: ['wumiguo|韭菜味 16斤 ¥128', 'wumiguo|菜脯味 7斤 ¥70', 'wumiguo|芋泥咸蛋味 7斤 ¥84'], unknown: [] } },
  { name: '账单44 土豆糕+咸蛋芋泥(36)', text: '咸蛋芋泥2\n土豆糕1',
    pre: () => api.saveCustomList([]),
    expect: { total: 36, lines: ['wumiguo|芋泥咸蛋味 2斤 ¥24', 'others|土豆条 1条 ¥12'], unknown: [] } },
  { name: '账单45 无米果+菜谱(428)', text: '无米果韭菜20，竹笋8，菜谱7，菜头丸10',
    pre: () => api.saveCustomList([]),
    expect: { total: 428, lines: ['wumiguo|韭菜味 20斤 ¥160', 'wumiguo|竹笋味 8斤 ¥88', 'wumiguo|菜脯味 7斤 ¥70', 'others|菜头丸 10斤 ¥110'], unknown: [] } },
  { name: '账单46 菜头丸在前+萝卜干(628)', text: '菜头丸20 无米粿韭菜30 萝卜干8 竹笋8',
    pre: () => api.saveCustomList([]),
    expect: { total: 628, lines: ['others|菜头丸 20斤 ¥220', 'wumiguo|韭菜味 30斤 ¥240', 'wumiguo|菜脯味 8斤 ¥80', 'wumiguo|竹笋味 8斤 ¥88'], unknown: [] } },
  { name: '账单47 虾饺虎皮卷+水晶球标题(1600)', text: '虾饺30斤\n虎皮卷10斤\n水晶球\n红豆20斤\n紫薯20斤\n竹笋20斤',
    pre: () => api.saveCustomList([]),
    expect: { total: 1600, lines: ['others|虾饺 30斤 ¥660', 'others|韭黄虎皮卷 10斤 ¥220', 'shuijingqiu|红豆 20斤 ¥240', 'shuijingqiu|紫薯 20斤 ¥240', 'shuijingqiu|竹笋 20斤 ¥240'], unknown: [] } },
  { name: '账单48 猪脚圈分行写法(361)', text: '无米粿，韭菜10，咸蛋黄3，菜脯3，土豆2，鲜笋3，香芋3，\n猪脚圈，土豆3，芋头3，萝卜3',
    pre: () => api.saveCustomList([]),
    expect: { total: 361, lines: ['wumiguo|韭菜味 10斤 ¥80', 'wumiguo|芋泥咸蛋味 3斤 ¥36', 'wumiguo|菜脯味 3斤 ¥30', 'wumiguo|土豆味 2斤 ¥20', 'wumiguo|竹笋味 3斤 ¥33', 'wumiguo|香芋味 3斤 ¥36', 'others|土豆饼 3斤 ¥42', 'others|香芋饼 3斤 ¥42', 'others|萝卜饼 3斤 ¥42'], unknown: [] } },
  { name: '账单49 标+许坤轩+猪脚圈分行(341)', text: '无米粿，\n韭菜10，\n咸蛋黄3，标\n菜脯3，标\n鲜笋3，标\n香芋3，标\n猪脚圈，\n土豆3，芋头3，萝卜3\n许坤轩',
    pre: () => api.saveCustomList([]),
    expect: { total: 341, lines: ['wumiguo|韭菜味 10斤 ¥80', 'wumiguo|芋泥咸蛋味 3斤 ¥36', 'wumiguo|菜脯味 3斤 ¥30', 'wumiguo|竹笋味 3斤 ¥33', 'wumiguo|香芋味 3斤 ¥36', 'others|土豆饼 3斤 ¥42', 'others|香芋饼 3斤 ¥42', 'others|萝卜饼 3斤 ¥42'], unknown: [] } },
  { name: '账单50 菜丸子+林标祥(242)', text: '香芋4斤\n菜丸子6斤\n韭菜16斤\n林标祥',
    pre: () => api.saveCustomList([]),
    expect: { total: 242, lines: ['wumiguo|香芋味 4斤 ¥48', 'others|菜头丸 6斤 ¥66', 'wumiguo|韭菜味 16斤 ¥128'], unknown: [] } },
  { name: '账单51 菜头丸子+苏先森(274)', text: '无米粿系列\n韭菜味 16斤\n玉米味 1斤 \n香芋味 4斤 \n菜头丸子8斤 \n苏先森',
    pre: () => api.saveCustomList([]),
    expect: { total: 274, lines: ['wumiguo|韭菜味 16斤 ¥128', 'wumiguo|玉米味 1斤 ¥10', 'wumiguo|香芋味 4斤 ¥48', 'others|菜头丸 8斤 ¥88'], unknown: [] } },
  { name: '账单52 林坪地(386)', text: '无米粿系列\n韭菜味 30\n香芋味 3\n菜头丸 10\n林坪地',
    pre: () => api.saveCustomList([]),
    expect: { total: 386, lines: ['wumiguo|韭菜味 30斤 ¥240', 'wumiguo|香芋味 3斤 ¥36', 'others|菜头丸 10斤 ¥110'], unknown: [] } },
  { name: '账单53 口味+无米粿+斤(88)', text: '韭菜无米粿6斤\n菜谱无米粿4斤',
    pre: () => api.saveCustomList([]),
    expect: { total: 88, lines: ['wumiguo|韭菜味 6斤 ¥48', 'wumiguo|菜脯味 4斤 ¥40'], unknown: [] } },
  { name: '账单54 芋头饼+菜头饼(56)', text: '芋头饼2\n菜头饼2',
    pre: () => api.saveCustomList([]),
    expect: { total: 56, lines: ['others|香芋饼 2斤 ¥28', 'others|萝卜饼 2斤 ¥28'], unknown: [] } },
  { name: '账单55 蔬菜卷+腐皮卷(60)', text: '蔬菜卷1\n腐皮卷1\n菜头丸2',
    pre: () => api.saveCustomList([]),
    expect: { total: 60, lines: ['others|蔬菜春卷 1斤 ¥16', 'others|韭黄虎皮卷 1斤 ¥22', 'others|菜头丸 2斤 ¥22'], unknown: [] } },
  { name: '账单56 口味+无米粿+条(362)', text: '韭菜无米粿15，菜脯4，竹笋4，芋头条2，土豆条2，韭黄虎皮卷5',
    pre: () => api.saveCustomList([]),
    expect: { total: 362, lines: ['wumiguo|韭菜味 15斤 ¥120', 'wumiguo|菜脯味 4斤 ¥40', 'wumiguo|竹笋味 4斤 ¥44', 'others|香芋条 2条 ¥24', 'others|土豆条 2条 ¥24', 'others|韭黄虎皮卷 5斤 ¥110'], unknown: [] } },
  { name: '账单57 猪脚圈模式不泄漏(66)', text: '无米粿\n土豆3\n芋头3',
    pre: () => api.saveCustomList([]),
    expect: { total: 66, lines: ['wumiguo|土豆味 3斤 ¥30', 'wumiguo|香芋味 3斤 ¥36'], unknown: [] } },
  { name: '账单58 蛋黄+紫菜卷(606)', text: '韭菜无米粿20 菜脯 13 蛋黄8   紫菜卷10',
    pre: () => api.saveCustomList([]),
    expect: { total: 606, lines: ['wumiguo|韭菜味 20斤 ¥160', 'wumiguo|菜脯味 13斤 ¥130', 'wumiguo|芋泥咸蛋味 8斤 ¥96', 'others|紫菜卷 10卷 ¥220'], unknown: [] } },
  { name: '账单59 猪脚圈3个口味各5+郑森鑫(330)', text: '猪脚圈3个口味各5\n 无米果  \n韭菜15\n郑森鑫',
    pre: () => api.saveCustomList([]),
    expect: { total: 330, lines: ['wumiguo|韭菜味 15斤 ¥120', 'others|香芋饼 5斤 ¥70', 'others|土豆饼 5斤 ¥70', 'others|萝卜饼 5斤 ¥70'], unknown: [] } },
  { name: '账单60 手作粿标题+许水城(440)', text: '无米果\n竹笋4标\n韭菜6\n菜脯4标\n香芋4标\n紫薯4\n芋泥4标\n\n手作粿\n土豆4\n芋头4\n萝卜4\n许水城',
    pre: () => api.saveCustomList([]),
    expect: { total: 440, lines: ['wumiguo|竹笋味 4斤 ¥44', 'wumiguo|韭菜味 6斤 ¥48', 'wumiguo|菜脯味 4斤 ¥40', 'wumiguo|香芋味 4斤 ¥48', 'wumiguo|紫薯味 4斤 ¥44', 'wumiguo|芋泥咸蛋味 4斤 ¥48', 'others|土豆饼 4斤 ¥56', 'others|香芋饼 4斤 ¥56', 'others|萝卜饼 4斤 ¥56'], unknown: [] } },
  { name: '账单61 手作粿+苏志喜(705)', text: '无米果\n竹笋2标\n韭菜12\n菜脯5标\n香芋6标\n紫薯3\n芋泥8标\n\n手作粿\n土豆8\n芋头8\n萝卜8\n苏志喜',
    pre: () => api.saveCustomList([]),
    expect: { total: 705, lines: ['wumiguo|竹笋味 2斤 ¥22', 'wumiguo|韭菜味 12斤 ¥96', 'wumiguo|菜脯味 5斤 ¥50', 'wumiguo|香芋味 6斤 ¥72', 'wumiguo|紫薯味 3斤 ¥33', 'wumiguo|芋泥咸蛋味 8斤 ¥96', 'others|土豆饼 8斤 ¥112', 'others|香芋饼 8斤 ¥112', 'others|萝卜饼 8斤 ¥112'], unknown: [] } },
  { name: '账单62 猪脚圈三个口味各10(703)', text: '韭菜6\n菜谱5 标\n竹笋5标\n紫薯2\n芋泥4标\n香芋5标\n猪脚圈三个口味各10',
    pre: () => api.saveCustomList([]),
    expect: { total: 703, lines: ['wumiguo|韭菜味 6斤 ¥48', 'wumiguo|菜脯味 5斤 ¥50', 'wumiguo|竹笋味 5斤 ¥55', 'wumiguo|紫薯味 2斤 ¥22', 'wumiguo|芋泥咸蛋味 4斤 ¥48', 'wumiguo|香芋味 5斤 ¥60', 'others|香芋饼 10斤 ¥140', 'others|土豆饼 10斤 ¥140', 'others|萝卜饼 10斤 ¥140'], unknown: [] } },
  { name: '账单63 林淑玲(290)', text: '韭菜18。菜谱8。菜头丸6 林淑玲',
    pre: () => api.saveCustomList([]),
    expect: { total: 290, lines: ['wumiguo|韭菜味 18斤 ¥144', 'wumiguo|菜脯味 8斤 ¥80', 'others|菜头丸 6斤 ¥66'], unknown: [] } },
  { name: '账单64 小土豆(258)', text: '无米粿\n韭菜味22\n菜脯味7\n小土豆1',
    pre: () => api.saveCustomList([]),
    expect: { total: 258, lines: ['wumiguo|韭菜味 22斤 ¥176', 'wumiguo|菜脯味 7斤 ¥70', 'others|小土豆 1斤 ¥12'], unknown: [] } },
  { name: '账单65 顿号分隔(607)', text: '无米粿、韭菜30、竹笋7、萝卜干7、菜头丸20',
    pre: () => api.saveCustomList([]),
    expect: { total: 607, lines: ['wumiguo|韭菜味 30斤 ¥240', 'wumiguo|竹笋味 7斤 ¥77', 'wumiguo|菜脯味 7斤 ¥70', 'others|菜头丸 20斤 ¥220'], unknown: [] } },
  { name: '账单66 海丰小米独立计价(330)', text: '无米粿系列\n韭菜味5斤\n菜脯味 5斤\n香芋味5斤\n海丰小米15斤',
    pre: () => api.saveCustomList([]),
    expect: { total: 330, lines: ['wumiguo|韭菜味 5斤 ¥40', 'wumiguo|菜脯味 5斤 ¥50', 'wumiguo|香芋味 5斤 ¥60', 'others|海丰小米 15斤 ¥180'], unknown: [] } },
  { name: '账单67 虾饺+水晶球标题(1120)', text: '虾饺40斤\n水晶球\n红豆10斤\n紫薯10斤',
    pre: () => api.saveCustomList([]),
    expect: { total: 1120, lines: ['others|虾饺 40斤 ¥880', 'shuijingqiu|红豆 10斤 ¥120', 'shuijingqiu|紫薯 10斤 ¥120'], unknown: [] } },
  { name: '账单68 小桃粿+陈智卿(550)', text: '无米粿系列\n韭菜味 10 \n紫薯味 10 \n菜脯味 10 \n香芋味 10 \n\n小桃粿 10包\n\n陈智卿',
    pre: () => api.saveCustomList([]),
    expect: { total: 550, lines: ['wumiguo|韭菜味 10斤 ¥80', 'wumiguo|紫薯味 10斤 ¥110', 'wumiguo|菜脯味 10斤 ¥100', 'wumiguo|香芋味 10斤 ¥120', 'others|小桃粿 10包 ¥140'], unknown: [] } },
  { name: '账单69 咸蛋芋泥+蔬菜卷(162)', text: '韭菜5，香芋2，菜脯1，咸蛋芋泥2，蔬菜卷4',
    pre: () => api.saveCustomList([]),
    expect: { total: 162, lines: ['wumiguo|韭菜味 5斤 ¥40', 'wumiguo|香芋味 2斤 ¥24', 'wumiguo|菜脯味 1斤 ¥10', 'wumiguo|芋泥咸蛋味 2斤 ¥24', 'others|蔬菜春卷 4斤 ¥64'], unknown: [] } },
  { name: '账单70 韭菜无米粿+萝卜饼(300)', text: '韭菜无米粿20斤\n萝卜饼10斤',
    pre: () => api.saveCustomList([]),
    expect: { total: 300, lines: ['wumiguo|韭菜味 20斤 ¥160', 'others|萝卜饼 10斤 ¥140'], unknown: [] } },
  { name: '账单71 韭菜竹笋菜头丸(71)', text: '韭菜2，竹笋1，菜头丸4',
    pre: () => api.saveCustomList([]),
    expect: { total: 71, lines: ['wumiguo|韭菜味 2斤 ¥16', 'wumiguo|竹笋味 1斤 ¥11', 'others|菜头丸 4斤 ¥44'], unknown: [] } },
  { name: '账单72 韭菜的20斤带"的"字(274)', text: '韭菜的20斤\n香芋7斤\n菜谱3斤',
    pre: () => api.saveCustomList([]),
    expect: { total: 274, lines: ['wumiguo|韭菜味 20斤 ¥160', 'wumiguo|香芋味 7斤 ¥84', 'wumiguo|菜脯味 3斤 ¥30'], unknown: [] } },
  { name: '账单73 括号多口味+菜头丸(565)', text: '无米粿（韭菜30，菜脯5，竹笋5），菜头丸20',
    pre: () => api.saveCustomList([]),
    expect: { total: 565, lines: ['wumiguo|韭菜味 30斤 ¥240', 'wumiguo|菜脯味 5斤 ¥50', 'wumiguo|竹笋味 5斤 ¥55', 'others|菜头丸 20斤 ¥220'], unknown: [] } },
  { name: '账单74 芋泥卷=芋泥春卷(572)', text: '韭菜20  菜脯10 咸蛋黄 5蔬菜卷1 芋泥卷1  紫菜卷10',
    pre: () => api.saveCustomList([]),
    expect: { total: 572, lines: ['wumiguo|韭菜味 20斤 ¥160', 'wumiguo|菜脯味 10斤 ¥100', 'wumiguo|芋泥咸蛋味 5斤 ¥60', 'others|蔬菜春卷 1斤 ¥16', 'others|芋泥春卷 1斤 ¥16', 'others|紫菜卷 10卷 ¥220'], unknown: [] } },
  { name: '账单75 猪脚圈土豆空格4(562)', text: '无米果 \n咸蛋黄6标\n韭菜16\n菜谱8标\n竹笋4标\n香芋4标\n紫薯2\n猪脚圈  芋头4土豆 4萝卜4',
    pre: () => api.saveCustomList([]),
    expect: { total: 562, lines: ['wumiguo|芋泥咸蛋味 6斤 ¥72', 'wumiguo|韭菜味 16斤 ¥128', 'wumiguo|菜脯味 8斤 ¥80', 'wumiguo|竹笋味 4斤 ¥44', 'wumiguo|香芋味 4斤 ¥48', 'wumiguo|紫薯味 2斤 ¥22', 'others|香芋饼 4斤 ¥56', 'others|土豆饼 4斤 ¥56', 'others|萝卜饼 4斤 ¥56'], unknown: [] } },
  { name: '账单76 猪脚圈下菜头=萝卜饼(356)', text: '无米粿\n韭菜8\n竹笋3标\n香芋4标\n紫薯1\n菜谱4标\n芋泥4标\n猪脚圈\n菜头3\n土豆5',
    pre: () => api.saveCustomList([]),
    expect: { total: 356, lines: ['wumiguo|韭菜味 8斤 ¥64', 'wumiguo|竹笋味 3斤 ¥33', 'wumiguo|香芋味 4斤 ¥48', 'wumiguo|紫薯味 1斤 ¥11', 'wumiguo|菜脯味 4斤 ¥40', 'wumiguo|芋泥咸蛋味 4斤 ¥48', 'others|萝卜饼 3斤 ¥42', 'others|土豆饼 5斤 ¥70'], unknown: [] } },
  { name: '账单77 芋头裸写+各5(447)', text: '无米果\n韭菜10\n菜脯3标\n芋泥3标\n竹笋3标\n紫薯2\n芋头3标\n猪脚圈\n芋头士豆菜脯各5',
    pre: () => api.saveCustomList([]),
    expect: { total: 447, lines: ['wumiguo|韭菜味 10斤 ¥80', 'wumiguo|菜脯味 3斤 ¥30', 'wumiguo|芋泥咸蛋味 3斤 ¥36', 'wumiguo|竹笋味 3斤 ¥33', 'wumiguo|紫薯味 2斤 ¥22', 'wumiguo|香芋味 3斤 ¥36', 'others|香芋饼 5斤 ¥70', 'others|土豆饼 5斤 ¥70', 'others|萝卜饼 5斤 ¥70'], unknown: [] } },
  { name: '账单78 芋泥咸蛋黄全称+鲜笋(407)', text: '无米果\n韭菜20\n菜谱5标\n香芋5标\n芋泥咸蛋黄5标\n鲜笋5标\n紫薯2',
    pre: () => api.saveCustomList([]),
    expect: { total: 407, lines: ['wumiguo|韭菜味 20斤 ¥160', 'wumiguo|菜脯味 5斤 ¥50', 'wumiguo|香芋味 5斤 ¥60', 'wumiguo|芋泥咸蛋味 5斤 ¥60', 'wumiguo|竹笋味 5斤 ¥55', 'wumiguo|紫薯味 2斤 ¥22'], unknown: [] } },
  { name: '账单79 数字+斤+品名+无米粿(260)', text: '20斤韭菜无米粿，10斤菜脯无米粿',
    pre: () => api.saveCustomList([]),
    expect: { total: 260, lines: ['wumiguo|韭菜味 20斤 ¥160', 'wumiguo|菜脯味 10斤 ¥100'], unknown: [] } },
  { name: '账单80 韭菜+蔬菜卷(96)', text: '韭菜10\n蔬菜卷 1',
    pre: () => api.saveCustomList([]),
    expect: { total: 96, lines: ['wumiguo|韭菜味 10斤 ¥80', 'others|蔬菜春卷 1斤 ¥16'], unknown: [] } },
  { name: '账单81 句号+林福皇(280)', text: '韭菜14。菜谱8。菜头丸8。林福皇',
    pre: () => api.saveCustomList([]),
    expect: { total: 280, lines: ['wumiguo|韭菜味 14斤 ¥112', 'wumiguo|菜脯味 8斤 ¥80', 'others|菜头丸 8斤 ¥88'], unknown: [] } },
  { name: '账单82 粿肉13斤+林伟棚(548)', text: '无米粿系列\n韭菜味 12斤 \n菜脯味 7斤 \n香芋味 8斤 \n---------\n粿肉 13斤 \n---------\n林伟棚',
    pre: () => api.saveCustomList([]),
    expect: { total: 548, lines: ['wumiguo|韭菜味 12斤 ¥96', 'wumiguo|菜脯味 7斤 ¥70', 'wumiguo|香芋味 8斤 ¥96', 'others|粿肉 13斤 ¥286'], unknown: [] } },
  { name: '账单83 冒号+菜头丸16(584)', text: '无米果：韭菜30，菜脯8，竹笋8 ，菜头丸16',
    pre: () => api.saveCustomList([]),
    expect: { total: 584, lines: ['wumiguo|韭菜味 30斤 ¥240', 'wumiguo|菜脯味 8斤 ¥80', 'wumiguo|竹笋味 8斤 ¥88', 'others|菜头丸 16斤 ¥176'], unknown: [] } },
  { name: '账单84 无米粿无口味提示(280)', text: '无米粿20斤\n萝卜饼10斤',
    pre: () => api.saveCustomList([]),
    expect: { total: 280, lines: ['others|萝卜饼 20斤 ¥280'], unknown: ['(数量未配品名) 10'] } },
  { name: '账单85 自定义复合品(韭菜春卷17)手动输入', text: '韭菜春卷 1',
    pre: () => api.saveCustomList([{ name: '韭菜春卷', price: 17, unit: '斤' }]),
    expect: { total: 17, lines: ['others|韭菜春卷 1斤 ¥17'], unknown: [] } },
  { name: '账单86 自定义复合品 AI误加味(韭菜味春卷)容错', text: '韭菜味春卷 1',
    pre: () => api.saveCustomList([{ name: '韭菜春卷', price: 17, unit: '斤' }]),
    expect: { total: 17, lines: ['others|韭菜春卷 1斤 ¥17'], unknown: [] } },
  { name: '账单87 自定义复合品混在无米粿中', text: '无米粿\n韭菜10\n菜脯5\n韭菜春卷3',
    pre: () => api.saveCustomList([{ name: '韭菜春卷', price: 17, unit: '斤' }]),
    expect: { total: 181, lines: ['wumiguo|韭菜味 10斤 ¥80', 'wumiguo|菜脯味 5斤 ¥50', 'others|韭菜春卷 3斤 ¥51'], unknown: [] } },
  { name: '账单88 海丰小米独立计价(36)', text: '海丰小米3斤',
    pre: () => api.saveCustomList([]),
    expect: { total: 36, lines: ['others|海丰小米 3斤 ¥36'], unknown: [] } },
  { name: '账单89 海丰小米与小米区分(60)', text: '海丰小米3斤 小米2斤',
    pre: () => api.saveCustomList([]),
    expect: { total: 60, lines: ['others|海丰小米 3斤 ¥36', 'others|小米 2斤 ¥24'], unknown: [] } },
  { name: '账单90 菜粿(60)', text: '菜粿5斤',
    pre: () => api.saveCustomList([]),
    expect: { total: 60, lines: ['others|菜粿 5斤 ¥60'], unknown: [] } },
  { name: '账单91 三角虾酥(48)', text: '三角虾酥4斤',
    pre: () => api.saveCustomList([]),
    expect: { total: 48, lines: ['others|三角虾酥 4斤 ¥48'], unknown: [] } },
  { name: '账单92 墨鱼虾排(80)', text: '墨鱼虾排5斤',
    pre: () => api.saveCustomList([]),
    expect: { total: 80, lines: ['others|墨鱼虾排 5斤 ¥80'], unknown: [] } },
  { name: '账单93 辣椒酱按桶(35)', text: '辣椒酱1桶',
    pre: () => api.saveCustomList([]),
    expect: { total: 35, lines: ['others|辣椒酱 1桶 ¥35'], unknown: [] } },
  { name: '账单94 生紫菜卷不与紫菜卷混淆(92)', text: '生紫菜卷3斤 紫菜卷2卷',
    pre: () => api.saveCustomList([]),
    expect: { total: 92, lines: ['others|生紫菜卷 3斤 ¥48', 'others|紫菜卷 2卷 ¥44'], unknown: [] } },
  { name: '账单95 红桃果别名=红桃粿(50)', text: '红桃果 20个',
    pre: () => api.saveCustomList([]),
    expect: { total: 50, lines: ['others|红桃粿 20个 ¥50'], unknown: [] } },
  { name: '账单96 菜头猪脚圈别名=萝卜饼(140)', text: '菜头猪脚圈 10斤',
    pre: () => api.saveCustomList([]),
    expect: { total: 140, lines: ['others|萝卜饼 10斤 ¥140'], unknown: [] } },
  { name: '账单97 素菜卷别名=蔬菜春卷(240)', text: '素菜卷 15斤',
    pre: () => api.saveCustomList([]),
    expect: { total: 240, lines: ['others|蔬菜春卷 15斤 ¥240'], unknown: [] } },
  { name: '账单98 盒单位等同斤只取数量(140)', text: '三角虾酥5盒 墨鱼虾排5盒',
    pre: () => api.saveCustomList([]),
    expect: { total: 140, lines: ['others|三角虾酥 5斤 ¥60', 'others|墨鱼虾排 5斤 ¥80'], unknown: [] } },
  { name: '账单99 普通各N中萝卜干=菜脯味非萝卜饼(838)', text: '珠江新城\n无米粿韭菜30、萝卜干和竹笋各18、菜头丸20',
    pre: () => api.saveCustomList([]),
    expect: { total: 838, lines: ['wumiguo|韭菜味 30斤 ¥240', 'wumiguo|菜脯味 18斤 ¥180', 'wumiguo|竹笋味 18斤 ¥198', 'others|菜头丸 20斤 ¥220'], unknown: ['珠江新城'] } },
];

for (const c of cases) {
  if (c.pre) c.pre();
  if (runCase(c.name, c.text, c.expect)) pass++; else fail++;
}
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
