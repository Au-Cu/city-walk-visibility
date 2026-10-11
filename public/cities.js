// Location shortcuts, not a claim that an entire city has complete OSM coverage.
const city=(id,name,english,center,extra={})=>({id,name,english,center,...extra});
export const CITIES=[
  city('tokyo','东京','Tokyo',[35.712,139.803],{district:'浅草—隅田川—押上',snapshot:'tokyo-asakusa.json',bounds:{south:35.701,west:139.786,north:35.723,east:139.821},points:[[35.71104,139.79633],[35.71465,139.80177],[35.71010,139.81070]]}),
  city('london','伦敦','London',[51.512,-.126],{district:'科文特花园—泰晤士河北岸',snapshot:'london.json',bounds:{south:51.501,west:-.141,north:51.52,east:-.111},points:[[51.5115,-.1335],[51.5122,-.1235],[51.5074,-.1185]]}),
  city('paris','巴黎','Paris',[48.856,2.352],{district:'玛黑区—塞纳河',snapshot:'paris.json',bounds:{south:48.846,west:2.335,north:48.865,east:2.371},points:[[48.8582,2.347],[48.8574,2.359],[48.8514,2.356]]}),
  city('new-york','纽约','New York',[40.716,-74.006],{district:'下曼哈顿—翠贝卡',snapshot:'new-york.json',bounds:{south:40.705,west:-74.021,north:40.727,east:-73.991},points:[[40.7148,-74.0112],[40.719,-74.008],[40.716,-73.999]]}),
  city('singapore','新加坡','Singapore',[1.293,103.852],{district:'市政区—新加坡河',snapshot:'singapore.json',bounds:{south:1.282,west:103.841,north:1.304,east:103.867},points:[[1.2948,103.851],[1.2913,103.85],[1.2874,103.8535]]}),
  city('seoul','首尔','Seoul',[37.567,126.986],{district:'明洞—清溪川—钟路',snapshot:'seoul.json',bounds:{south:37.552,west:126.972,north:37.579,east:127.002},points:[[37.5613,126.986],[37.5667,126.984],[37.5707,126.988]]}),
  city('sapporo','札幌','Sapporo',[43.06,141.354],{district:'薄野—大通公园—札幌站南侧',snapshot:'sapporo.json',bounds:{south:43.047,west:141.341,north:43.072,east:141.372},points:[[43.0551,141.3535],[43.06,141.3549],[43.0642463,141.3494491]]}),
  city('amsterdam','阿姆斯特丹','Amsterdam',[52.372,4.894],{district:'运河带—水坝广场',snapshot:'amsterdam.json',bounds:{south:52.362,west:4.877,north:52.382,east:4.908},points:[[52.3697603,4.884276],[52.373,4.89],[52.373,4.9]]}),
  city('hangzhou','杭州','Hangzhou',[30.249,120.166],{district:'西湖东岸—吴山—河坊街',snapshot:'hangzhou.json',bounds:{south:30.237,west:120.154,north:30.263,east:120.18},points:[[30.2542,120.164],[30.249,120.165],[30.2431,120.17]]}),
  city('kyoto','京都','Kyoto',[35.006,135.771],{district:'三条—鸭川—祇园',snapshot:'kyoto.json',bounds:{south:34.9985,west:135.763,north:35.0145,east:135.7815},points:[[35.0087,135.7677],[35.0085,135.7728],[35.0037,135.7754]]}),
  ...[
    ['beijing','北京','Beijing',39.916,116.397],['shanghai','上海','Shanghai',31.237,121.485],
    ['taipei','台北','Taipei',25.037,121.563],['hong-kong','香港','Hong Kong',22.282,114.158],
    ['osaka','大阪','Osaka',34.669,135.502],
    ['bangkok','曼谷','Bangkok',13.756,100.501],['hanoi','河内','Hanoi',21.029,105.853],
    ['delhi','德里','Delhi',28.63,77.217],['dubai','迪拜','Dubai',25.263,55.298],
    ['istanbul','伊斯坦布尔','Istanbul',41.012,28.977],['rome','罗马','Rome',41.898,12.476],
    ['barcelona','巴塞罗那','Barcelona',41.386,2.17],['madrid','马德里','Madrid',40.416,-3.703],
    ['berlin','柏林','Berlin',52.519,13.405],
    ['vienna','维也纳','Vienna',48.208,16.373],['prague','布拉格','Prague',50.087,14.421],
    ['zurich','苏黎世','Zurich',47.373,8.542],['helsinki','赫尔辛基','Helsinki',60.17,24.952],
    ['san-francisco','旧金山','San Francisco',37.795,-122.406],['los-angeles','洛杉矶','Los Angeles',34.05,-118.248],
    ['chicago','芝加哥','Chicago',41.883,-87.63],['vancouver','温哥华','Vancouver',49.283,-123.12],
    ['toronto','多伦多','Toronto',43.65,-79.383],['mexico-city','墨西哥城','Mexico City',19.433,-99.133],
    ['sao-paulo','圣保罗','Sao Paulo',-23.55,-46.634],['buenos-aires','布宜诺斯艾利斯','Buenos Aires',-34.608,-58.373],
    ['sydney','悉尼','Sydney',-33.869,151.208],['melbourne','墨尔本','Melbourne',-37.814,144.963],
    ['auckland','奥克兰','Auckland',-36.848,174.765],['cape-town','开普敦','Cape Town',-33.924,18.424],
    ['cairo','开罗','Cairo',30.047,31.239],['nairobi','内罗毕','Nairobi',-1.286,36.819]
  ].map(([id,name,english,lat,lon])=>city(id,name,english,[lat,lon]))
];
export const cityById=id=>CITIES.find(c=>c.id===id);
