// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 精细战区 · 战区段（粗一级指挥） =====================
 * 玩家可以切换到“简化”指挥：区格合并成十几个战区段，部队按战区段编成方面军，命令下到方面军；底层仍逐日精细推演。
 * 划分按地理与当年的作战地区：西线按荷兰、比利时（含阿登）、法国各军区与马奇诺防线、德国西部各地区；
 * 中国战场按各战区与主要会战地区（华北、中原、徐淮、京沪杭、武汉、湘北、两广、大后方等）。
 */
if (typeof TH_DATA !== 'undefined') {
  if (TH_DATA.W) TH_DATA.W.sec = [
    { id: 'NL', n: ['荷兰', 'Netherlands'], z: ['NHO', 'NRO', 'NUT', 'NGE', 'NNE', 'NBR', 'NLI', 'NZE'] },
    { id: 'BN', n: ['比利时北部', 'Northern Belgium'], z: ['BAN', 'BBR', 'BFL', 'BAL'] },
    { id: 'BS', n: ['比利时中南部', 'Central Belgium'], z: ['BGE', 'BLG', 'BHA', 'BSM'] },
    { id: 'AR', n: ['阿登—卢森堡', 'Ardennes–Luxembourg'], z: ['BAW', 'BAR', 'BBA', 'BNE', 'LUX'] },
    { id: 'FN', n: ['法国北部', 'Northern France'], z: ['FDK', 'FBO', 'FLI', 'FAR'] },
    { id: 'SO', n: ['索姆—皮卡第', 'Somme–Picardy'], z: ['FSO', 'FBE', 'FLA'] },
    { id: 'MS', n: ['默兹河—色当', 'Meuse–Sedan'], z: ['FMA', 'FRO', 'FSE'] },
    { id: 'PA', n: ['巴黎地区', 'Paris region'], z: ['FPA', 'FCO'] },
    { id: 'CH', n: ['香槟—阿戈讷', 'Champagne–Argonne'], z: ['FRE', 'FCH', 'FVE', 'FSD'] },
    { id: 'LO', n: ['洛林（马奇诺防线）', 'Lorraine (Maginot)'], z: ['FMO', 'FME', 'FSA', 'FNA'] },
    { id: 'AL', n: ['阿尔萨斯—孚日', 'Alsace–Vosges'], z: ['FLT', 'FAL', 'FHA', 'FBF', 'FVO'] },
    { id: 'BG', n: ['勃艮第—汝拉', 'Burgundy–Jura'], z: ['FDI', 'FBS'] },
    { id: 'NO', n: ['诺曼底', 'Normandy'], z: ['FRU', 'FNO'] },
    { id: 'FW', n: ['法国西部', 'Western France'], z: ['FBR', 'FMN', 'FOR', 'FNT'] },
    { id: 'FS', n: ['法国南部', 'Southern France'], z: ['FMC', 'FLY', 'FAP', 'FPR', 'FSW', 'FLG'] },
    { id: 'RH', n: ['鲁尔—下莱茵', 'Ruhr–Lower Rhine'], z: ['DKL', 'DRU', 'DWE', 'DNI', 'DAA', 'DKO'] },
    { id: 'ES', n: ['艾费尔—萨尔', 'Eifel–Saar'], z: ['DEI', 'DTR', 'DKB', 'DSA'] },
    { id: 'SG', n: ['德国西南', 'South-west Germany'], z: ['DMA', 'DBA', 'DHE', 'DST', 'DBY'] },
    { id: 'IT', n: ['意大利西北', 'North-west Italy'], z: ['IPI', 'ILI', 'ILO'] },
    { id: 'GB', n: ['英格兰南部', 'Southern England'], z: ['GSE'] },
  ];
  if (TH_DATA.C) TH_DATA.C.sec = [
    { id: 'MC', n: ['东北', 'Manchuria'], z: ['MHB', 'MQQ', 'MMD', 'MCC', 'MSY', 'MDL', 'MRH', 'MJZ', 'MXA'] },
    { id: 'MJ', n: ['察绥', 'Chahar–Suiyuan'], z: ['NZJ', 'NDT', 'NSY', 'NXL', 'NHT'] },
    { id: 'HB', n: ['冀察（平津—冀中）', 'Hebei (Peking–Tientsin)'], z: ['HPJ', 'HJD', 'HBD', 'HSJ', 'HFP', 'HCZ', 'HXT', 'HDZ'] },
    { id: 'SD', n: ['山东', 'Shantung'], z: ['SJN', 'SQD', 'SYM', 'SLN'] },
    { id: 'SX', n: ['山西', 'Shansi'], z: ['STY', 'SXB', 'SLL', 'SCZ', 'STL', 'SZT'] },
    { id: 'SG', n: ['陕甘宁边区', 'Shen-Kan-Ning'], z: ['YYA', 'YQY', 'YSD', 'WYL', 'WNX'] },
    { id: 'GZ', n: ['关中—陇东', 'Kuanchung–Kansu'], z: ['WXA', 'WTG', 'WBJ', 'WPL', 'WHZ', 'WLZ'] },
    { id: 'ZY', n: ['中原（豫北—豫东）', 'Central Plains (Honan)'], z: ['HKF', 'HHF', 'HXX', 'WZZ', 'WLY', 'WNY'] },
    { id: 'XH', n: ['徐淮', 'Hsuchow–Huai'], z: ['SXZ', 'JSB', 'JSZ', 'CBB', 'CHF'] },
    { id: 'JH', n: ['京沪杭', 'Nanking–Shanghai–Hangchow'], z: ['JNJ', 'JSH', 'JHZ', 'JND', 'CWN'] },
    { id: 'ZM', n: ['浙闽', 'Chekiang–Fukien'], z: ['JWZ', 'FFZ', 'FXM', 'CJH', 'CSR'] },
    { id: 'WH', n: ['武汉—鄂豫皖', 'Wuhan–Tapieh'], z: ['CWH', 'CXY', 'CDB', 'CSZ', 'CAQ'] },
    { id: 'EX', n: ['鄂西—襄樊', 'Western Hupeh'], z: ['CXF', 'CYC', 'CJZ', 'CJM', 'CES'] },
    { id: 'XB', n: ['赣北—湘北', 'Northern Kiangsi–Hunan'], z: ['CJJ', 'CNC', 'CXS', 'CYY', 'CCS', 'CCD'] },
    { id: 'XN', n: ['湘南—赣南', 'Southern Hunan–Kiangsi'], z: ['CHY', 'CZJ', 'CGZ'] },
    { id: 'LG', n: ['两广', 'Kwangtung–Kwangsi'], z: ['GGZ', 'GSG', 'GST', 'GZJ', 'GHN', 'GNN', 'GGL', 'GLZ', 'GBS'] },
    { id: 'SC', n: ['四川', 'Szechwan'], z: ['XCQ', 'XCD', 'XWX', 'XYB', 'XGZ'] },
    { id: 'YG', n: ['云贵', 'Yunnan–Kweichow'], z: ['XGY', 'XZY', 'XDS', 'XKM', 'XDL', 'XMZ'] },
    { id: 'XB2', n: ['西北边远', 'Far north-west'], z: ['WQH', 'WHX', 'WXJ', 'WTB', 'WXK'] },
    { id: 'KR', n: ['朝鲜', 'Korea'], z: ['KNK', 'KSK'] },
    { id: 'JT', n: ['日本—台湾', 'Japan–Formosa'], z: ['JBA', 'TTW'] },
    { id: 'IC', n: ['印度支那—缅甸', 'Indochina–Burma'], z: ['AHN', 'ABM'] },
    { id: 'SU', n: ['外蒙—苏联', 'Mongolia–USSR'], z: ['OMG', 'RFE', 'RCA'] },
  ];
}
