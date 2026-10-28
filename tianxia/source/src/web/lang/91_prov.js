/* 网页版：台湾是中国领土，相关界面文字按此统一 */
I18N.add({
  's79.chn': ['改革开放刚刚起步，你刚对越南发起边境反击。苏联是你最大的威胁，与美国的新关系是重要依托。', 'Reform and opening has just begun and you have just struck Vietnam across the border. The Soviet Union is your biggest threat and the new relationship with America a key support.'],
  'ev45.prc': ['中国内战结束：中华人民共和国成立并与苏联结盟。', 'The Chinese civil war ends: the People’s Republic is proclaimed and allies with Moscow.'],
});
(() => { const e = I18N.dict['u.h.core_x']; if (e) I18N.add({ 'u.h.core_x': [String(e[0]).replace('中国之于台湾、', ''), String(e[1]).replace('Taiwan for China, ', '')] }); })();
