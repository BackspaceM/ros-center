'use strict';
/* MAC 厂商识别（OUI）：内置常见厂商前缀，离线查表，零依赖、零外部 API。
   覆盖家庭/企业网绝大多数设备；未收录的返回空串，界面只显示 MAC。
   数据来源：IEEE OUI 公开分配表（常见条目精选）。 */
(function () {
  /* 键为 MAC 前 6 位十六进制（大写，无分隔符）；值为厂商简称 */
  const DB = {
    /* 苹果 */
    'A483E7': 'Apple', '3C22FB': 'Apple', '000A95': 'Apple', '001CB3': 'Apple', '001EE5': 'Apple',
    '0026BB': 'Apple', '0860A8': 'Apple', '10A5D0': 'Apple', '1C362B': 'Apple', '28CFE9': 'Apple',
    '3413C7': 'Apple', '3C064A': 'Apple', '40331A': 'Apple', '4C578C': 'Apple', '54E43A': 'Apple',
    '586D8C': 'Apple', '5C969D': 'Apple', '64076E': 'Apple', '6C3E6D': 'Apple', '70CD60': 'Apple',
    '782C1C': 'Apple', '7CD5E1': 'Apple', '8488E5': 'Apple', '88E6D1': 'Apple', '8C2964': 'Apple',
    '98F5A2': 'Apple', 'A45E45': 'Apple', 'A8BBCD': 'Apple', 'B09D14': 'Apple', 'B4F2AA': 'Apple',
    'B8C75D': 'Apple', 'BC525F': 'Apple', 'C02D19': 'Apple', 'C86394': 'Apple', 'C8A9B3': 'Apple',
    'CC20E8': 'Apple', 'D0034B': 'Apple', 'D83062': 'Apple', 'E0ACCB': 'Apple', 'E49A43': 'Apple',
    'ECADC0': 'Apple', 'F01898': 'Apple', 'F04F7C': 'Apple', 'F45C89': 'Apple', 'F81EDF': 'Apple',
    /* 三星 */
    '001247': 'Samsung', '001599': 'Samsung', '00166B': 'Samsung', '001C99': 'Samsung',
    '001D25': 'Samsung', '001EA7': 'Samsung', '00213E': 'Samsung', '002399': 'Samsung',
    '002454': 'Samsung', '00256F': 'Samsung', '089090': 'Samsung', '1078D2': 'Samsung',
    '185680': 'Samsung', '1C6286': 'Samsung', '2060FE': 'Samsung', '286DCD': 'Samsung',
    '2C5CA3': 'Samsung', '34250C': 'Samsung', '3C71BF': 'Samsung', '404E81': 'Samsung',
    '4C6641': 'Samsung', '5001D9': 'Samsung', '54A050': 'Samsung', '60ECB5': 'Samsung',
    '64680C': 'Samsung', '68EA75': 'Samsung', '7C3E90': 'Samsung', '8038BC': 'Samsung',
    '88189E': 'Samsung', '8C3E0A': 'Samsung', '9C1C11': 'Samsung', 'A0143D': 'Samsung',
    'A4CF12': 'Samsung', 'B0359F': 'Samsung', 'B8E8B5': 'Samsung', 'C08ADE': 'Samsung',
    'D850E6': 'Samsung', 'E0508B': 'Samsung', 'E45760': 'Samsung', 'EC1F72': 'Samsung',
    /* 华为 / 荣耀 */
    '001882': 'Huawei', '0022A1': 'Huawei', '04D97B': 'Huawei', '0CEFD4': 'Huawei',
    '204EF6': 'Huawei', '244BFE': 'Huawei', '283152': 'Huawei', '2C36AF': 'Huawei',
    '34298D': 'Huawei', '3822D6': 'Huawei', '3C5282': 'Huawei', '4C1D96': 'Huawei',
    '548998': 'Huawei', '582F7C': 'Huawei', '5C7D5D': 'Huawei', '64167F': 'Huawei',
    '6C4B90': 'Huawei', '70BAEF': 'Huawei', '740353': 'Huawei', '7C1E52': 'Huawei',
    '800588': 'Huawei', '8410C9': 'Huawei', '882583': 'Huawei', '9C658B': 'Huawei',
    'A021B7': 'Huawei', 'A449DA': 'Huawei', 'A84E3F': 'Huawei', 'AC96D2': 'Huawei',
    'B07B25': 'Huawei', 'B44A2A': 'Huawei', 'C04578': 'Huawei', 'C80518': 'Huawei',
    'D8126F': 'Huawei', 'D86DD6': 'Huawei', 'E03901': 'Huawei', 'E868A0': 'Huawei',
    'EC6AEA': 'Huawei', 'F0456E': 'Huawei', 'F84CB2': 'Huawei',
    /* 小米 / Redmi */
    '186590': 'Xiaomi', '207918': 'Xiaomi', '240995': 'Xiaomi', '283204': 'Xiaomi',
    '34808D': 'Xiaomi', '4C49E3': 'Xiaomi', '546009': 'Xiaomi', '589C5F': 'Xiaomi',
    '640980': 'Xiaomi', '68DFDD': 'Xiaomi', '7811DC': 'Xiaomi', '7CDFA1': 'Xiaomi',
    '801F02': 'Xiaomi', '8C1645': 'Xiaomi', '9822EF': 'Xiaomi', 'A01E06': 'Xiaomi',
    'A45046': 'Xiaomi', 'B88F20': 'Xiaomi', 'C41426': 'Xiaomi', 'D03A45': 'Xiaomi',
    'E4956E': 'Xiaomi', 'F09FC2': 'Xiaomi', 'F40FCC': 'Xiaomi', 'FC19AF': 'Xiaomi',
    /* TP-Link */
    '001D0F': 'TP-Link', '002127': 'TP-Link', '0023CD': 'TP-Link', '002586': 'TP-Link',
    '0026C7': 'TP-Link', '048D38': 'TP-Link', '08BD43': 'TP-Link', '0C8063': 'TP-Link',
    '1027F5': 'TP-Link', '14CC20': 'TP-Link', '1C3BF3': 'TP-Link', '206E9F': 'TP-Link',
    '240118': 'TP-Link', '286ED4': 'TP-Link', '2C3033': 'TP-Link', '3035AD': 'TP-Link',
    '346EDA': 'TP-Link', '386077': 'TP-Link', '40A5EF': 'TP-Link', '44D9E7': 'TP-Link',
    '485D60': 'TP-Link', '4CE676': 'TP-Link', '503FF2': 'TP-Link', '5405DB': 'TP-Link',
    '586D8F': 'TP-Link', '603E2C': 'TP-Link', '647002': 'TP-Link', '68FF7B': 'TP-Link',
    '6C5C99': 'TP-Link', '704F57': 'TP-Link', '74DA38': 'TP-Link', '78FD94': 'TP-Link',
    '8481C6': 'TP-Link', '8C210A': 'TP-Link', '9031E2': 'TP-Link', '94C691': 'TP-Link',
    '98DAC4': 'TP-Link', '9C197C': 'TP-Link', 'A0F3C1': 'TP-Link', 'A42BB0': 'TP-Link',
    'A8423A': 'TP-Link', 'AC84C6': 'TP-Link', 'B0487A': 'TP-Link', 'B4994C': 'TP-Link',
    'BC4699': 'TP-Link', 'C01912': 'TP-Link', 'CC32E5': 'TP-Link', 'D03745': 'TP-Link',
    'D86AA5': 'TP-Link', 'DC9B9A': 'TP-Link', 'E005C5': 'TP-Link', 'E4C2D1': 'TP-Link',
    'E848B8': 'TP-Link', 'EC71DB': 'TP-Link', 'F4EC38': 'TP-Link', 'F8D111': 'TP-Link',
    'FCFBFB': 'TP-Link',
    /* MikroTik */
    '000C42': 'MikroTik', '4C5E0C': 'MikroTik', '48A98A': 'MikroTik', '64D154': 'MikroTik',
    'A491B1': 'MikroTik', 'CC2DE0': 'MikroTik', 'D8490B': 'MikroTik', '78C2A0': 'MikroTik',
    '081F9F': 'MikroTik', '3C09E5': 'MikroTik',
    /* Ubiquiti */
    '00144F': 'Ubiquiti', '00156D': 'Ubiquiti', '002722': 'Ubiquiti', '0418D6': 'Ubiquiti',
    '18B430': 'Ubiquiti', '24A43C': 'Ubiquiti', '74ACB9': 'Ubiquiti', '802AA8': 'Ubiquiti',
    'B4FBE4': 'Ubiquiti', 'FCECDA': 'Ubiquiti', '0022B5': 'Ubiquiti', '788DAF': 'Ubiquiti',
    /* 树莓派 */
    'B827EB': 'Raspberry Pi', 'DCA632': 'Raspberry Pi', 'E45F01': 'Raspberry Pi',
    '28CDC1': 'Raspberry Pi', 'D83ADD': 'Raspberry Pi',
    /* Intel */
    '001B21': 'Intel', '001D7E': 'Intel', '00216A': 'Intel', '0026B9': 'Intel',
    'A4AE12': 'Intel', '3C52C5': 'Intel', '8C1F64': 'Intel', 'F01898': 'Intel',
    /* 戴尔 */
    '001422': 'Dell', '001D60': 'Dell', '0023AE': 'Dell', '0024E8': 'Dell',
    '1866DA': 'Dell', '24B6FD': 'Dell', '3420F0': 'Dell', '3CF5D7': 'Dell',
    /* 思科 */
    '000E58': 'Cisco', '001217': 'Cisco', '001A4B': 'Cisco', '00224D': 'Cisco',
    '0024C1': 'Cisco', '003595': 'Cisco', '084F49': 'Cisco', '185B30': 'Cisco',
    '204C9E': 'Cisco', '2C4F52': 'Cisco', '3473D1': 'Cisco', 'F0CA18': 'Cisco',
    /* VMware / 虚拟机 */
    '000C29': 'VMware', '005056': 'VMware', '00155D': 'Microsoft Hyper-V',
    '00163E': 'VirtualBox', '080027': 'VirtualBox', '0A0027': 'VirtualBox',
    /* 海康威视 */
    '4419B6': 'Hikvision', '64644A': 'Hikvision', 'C06599': 'Hikvision',
    'D89675': 'Hikvision', 'E46E70': 'Hikvision', 'F855A8': 'Hikvision',
    /* 大华 */
    '3CF862': 'Dahua', '50126E': 'Dahua', '7C2CFA': 'Dahua', '940BBF': 'Dahua',
    'A4C718': 'Dahua', 'C42F2A': 'Dahua', 'E46F52': 'Dahua', 'F483CD': 'Dahua',
    /* 群晖 / 威联通 */
    '001132': 'Synology', '9009D0': 'Synology', 'A0553C': 'Synology', 'FC3FDB': 'Synology',
    '00089B': 'QNAP', '245EBE': 'QNAP', '3431C4': 'QNAP', '8C1F64': 'QNAP',
    /* 华硕 */
    '00112F': 'ASUS', '08606E': 'ASUS', '10A5D0': 'ASUS', '14D64D': 'ASUS',
    '201E88': 'ASUS', '2C4D54': 'ASUS', '38D57A': 'ASUS', '406231': 'ASUS',
    '50EBF6': 'ASUS', '6045CB': 'ASUS', '704D7B': 'ASUS', '88D7F6': 'ASUS',
    '983B16': 'ASUS', 'B06EBF': 'ASUS', 'C074AD': 'ASUS', 'E03F49': 'ASUS',
    /* 其他常见 */
    '00E04C': 'Realtek', '0022F3': 'Sony', '3C7C3F': 'Sony', '4C7DBD': 'LG',
    '001E75': 'LG', '08EA44': 'NVIDIA', '70285B': 'NVIDIA', '18FE34': 'Espressif',
    '5CCF7F': 'Espressif', 'A020A6': 'Espressif', 'CC50E3': 'Espressif',
    '78A2D1': 'Huawei', 'D8F15B': 'Nintendo', '0022AA': 'Nintendo',
    '7CBB11': 'Google', '94EB2C': 'Google', 'F4F5D7': 'Google',
    '0C8BFD': 'Amazon', '40B4F2': 'Amazon', '74C246': 'Amazon', 'FC71C8': 'Amazon',
  };

  /* 图形徽标：Simple Icons 官方品牌路径 + 原厂主色，透明背景、无底板。
     路径与浅/深色主题配色内置于 oui-logos.js，离线可用，不发起外部请求。 */
  function escAttr(x) { return String(x).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  window.ouiLogo = function ouiLogo(vendor, size) {
    if (!vendor) return '';
    const db = (typeof window.OUI_LOGOS === 'object' && window.OUI_LOGOS) ? window.OUI_LOGOS : null;
    const data = db && db[vendor];
    if (!data) return '';
    const s = Math.max(12, Math.min(32, Number(size) || 18));
    const inner = data.d
      ? '<path d="' + data.d + '"/>'
      : '<text x="12" y="12" text-anchor="middle" dominant-baseline="central" ' +
        'font-family="Arial,sans-serif" font-weight="700" font-size="15">' +
        escAttr(data.a || String(vendor).charAt(0)) + '</text>';
    return '<svg class="oui-logo" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" ' +
      'style="--oui-c:' + data.c + ';--oui-dk:' + data.dk + '" role="img" aria-label="' + escAttr(vendor) + '">' +
      inner + '</svg>';
  };
  window.ouiVendor = function ouiVendor(mac) {
    const s = String(mac || '').toUpperCase().replace(/[^0-9A-F]/g, '');
    if (s.length < 6) return '';
    return DB[s.slice(0, 6)] || '';
  };
  window.ouiCount = Object.keys(DB).length;
})();
