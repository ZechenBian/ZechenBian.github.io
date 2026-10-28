// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 地图图层、战线箭头与动画 */
I18N.add({
  'u.ly.btn': ['图层', 'Layers'],
  'u.ly.title': ['地图图层', 'Map layers'],
  'u.ly.p.simple': ['简洁', 'Simple'], 'u.ly.p.ops': ['作战', 'Operations'], 'u.ly.p.econ': ['经济', 'Economy'], 'u.ly.p.all': ['全部', 'All'],
  'u.ly.front': ['战线箭头与兵力集群', 'Front arrows & force clusters'],
  'u.ly.supply': ['补给线', 'Supply lines'],
  'u.ly.sea': ['航运线与封锁', 'Sea lanes & blockades'],
  'u.ly.rail': ['铁路干线', 'Main railways'],
  'u.ly.res': ['油田与煤田', 'Oil & coal fields'],
  'u.ly.choke': ['海峡要冲', 'Strategic straits'],
  'u.ly.units': ['驻军与在途部队', 'Garrisons & troops in transit'],
  'u.ly.labels': ['国名标注', 'Country names'],
  'u.ly.anim': ['动画', 'Animation'],
  'u.ly.a.auto': ['自动', 'Auto'], 'u.ly.a.on': ['开', 'On'], 'u.ly.a.off': ['关', 'Off'],
  'u.ly.anim_x': ['自动：手机上只播开战动画，系统设置为“减少动态效果”时关闭。箭头粗细表示投入的兵力，图标是兵力集群（坦克、步兵、飞机、舰艇）；航线粗细表示该年代的相对运量，红色虚线是战区或封锁。', 'Auto: phones only play the offensive animation, and animation is off when your system asks for reduced motion. Arrow width shows the force committed and the icons its make-up (tanks, infantry, aircraft, ships); sea-lane width shows relative trade volume in that era, and red dashes mark war zones or blockades.'],
  'u.ly.vol': ['运量', 'Traffic'],
  'u.ly.v1': ['较小', 'Light'], 'u.ly.v2': ['中等', 'Moderate'], 'u.ly.v3': ['繁忙', 'Busy'], 'u.ly.v4': ['极为繁忙', 'Very heavy'],
  'u.ly.hot': ['部分航段处于战区或封锁之中', 'Parts of the route run through a war zone or blockade'],
  'u.ly.kind': ['类型', 'Type'], 'u.ly.road': ['公路（战时补给线）', 'Road (wartime supply route)'], 'u.ly.railway': ['铁路干线', 'Main railway'],
  'u.ly.ctrl': ['控制方', 'Held by'],
  'u.ly.size': ['规模', 'Output'],
  'u.ly.s1': ['小', 'Small'], 'u.ly.s2': ['大', 'Large'], 'u.ly.s3': ['特大', 'Very large'],
  'u.ly.res_war': ['控制方正在交战：可能成为打击或争夺的目标', 'Its holder is at war: a likely target to strike or seize'],
  'u.ly.choke_war': ['战时：对{x}关闭', 'Wartime: closed to {x}'],
  'u.ly.choke_ok': ['平时：各国船只通航', 'Peacetime: open to all shipping'],
  'u.fa.new': ['开战', 'Attack!'],
  'u.fa.decl': ['宣战', 'War'],
});
I18N.add({
  'mp.h.map': ['地图图层：', 'Map layers: '],
  'mp.h.map_x': ['地图右上角的「图层」可以按需打开或关闭：战线箭头与兵力集群（箭头越粗投入的兵力越多，图标表示坦克、步兵、飞机、舰艇；刚发动的攻势会播放开战动画）、补给线、航运线与封锁（线越粗运量越大，红色虚线是战区）、铁路干线、油田与煤田、海峡要冲、驻军。也可以一键切换「简洁 / 作战 / 经济 / 全部」；动画可以关掉。', 'Use Layers at the top right of the map to show what you need: front arrows and force clusters (thicker arrows mean more troops committed; icons show tanks, infantry, aircraft and ships; new offensives play a launch animation), supply lines, sea lanes and blockades (thicker lanes carry more trade; red dashes mark war zones), main railways, oil and coal fields, strategic straits and garrisons. Switch presets in one click — Simple, Operations, Economy, All — and turn animation off if you prefer.'],
});
