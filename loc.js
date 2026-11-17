// Runway data: hdg in degrees magnetic, len/wid in metres.
// Entries marked "approx" are from memory and must be verified against
// current AIP/AIS before any operational use.
const RUNWAYS = Object.freeze({
  // Canada — Ontario
  CYYZ:{hdg:60,len:3389,wid:61},CYTZ:{hdg:80,len:1216,wid:30},
  CYKF:{hdg:140,len:1524,wid:46},CYOO:{hdg:120,len:1768,wid:46},
  CYHM:{hdg:120,len:1798,wid:46},CYKZ:{hdg:150,len:914,wid:23},
  CYXU:{hdg:150,len:2744,wid:61},CYWG:{hdg:130,len:2743,wid:61},
  // Canada — Quebec
  CYUL:{hdg:64,len:3353,wid:61},CYMX:{hdg:60,len:3658,wid:61},
  CYHU:{hdg:150,len:1829,wid:46},CYQB:{hdg:240,len:2743,wid:61},
  CYSB:{hdg:40,len:2134,wid:46},
  // Canada — BC/West
  CYVR:{hdg:80,len:3600,wid:61},CYYJ:{hdg:88,len:1757,wid:45},
  CZBB:{hdg:120,len:1067,wid:23},CYCD:{hdg:160,len:1524,wid:30},
  CYXS:{hdg:150,len:2438,wid:46},CYXX:{hdg:70,len:2134,wid:46},
  // Canada — Alberta / Prairies
  CYYC:{hdg:170,len:3963,wid:61},CYBW:{hdg:160,len:1524,wid:30},
  CYEG:{hdg:20,len:3109,wid:61},CYXD:{hdg:160,len:1524,wid:30},
  CYXE:{hdg:90,len:2800,wid:60},CYQR:{hdg:80,len:2600,wid:60},
  CYBR:{hdg:80,len:2438,wid:61},
  // Canada — East / Maritimes
  CYOW:{hdg:79,len:2438,wid:61},CYYG:{hdg:30,len:1829,wid:46},
  CYHZ:{hdg:150,len:2347,wid:61},CYQM:{hdg:60,len:2438,wid:46},
  CYFC:{hdg:90,len:1980,wid:45},CYSJ:{hdg:140,len:1829,wid:46},
  CYYT:{hdg:110,len:2590,wid:61},CYGV:{hdg:90,len:1524,wid:30},
  // USA
  KJFK:{hdg:44,len:3400,wid:60},KLAX:{hdg:69,len:3685,wid:61},
  KORD:{hdg:100,len:3657,wid:61},KATL:{hdg:98,len:3624,wid:61},
  KDFW:{hdg:180,len:4085,wid:61},KDEN:{hdg:170,len:4877,wid:61},
  KSFO:{hdg:280,len:3618,wid:61},  // approx; 28R/10L assumed primary, unverified
  KLAS:{hdg:190,len:4423,wid:61},KMIA:{hdg:90,len:3962,wid:61},
  KSEA:{hdg:163,len:3627,wid:61},KPHX:{hdg:260,len:3459,wid:61},
  KIAH:{hdg:150,len:3963,wid:61},KEWR:{hdg:40,len:3353,wid:46},
  KMSP:{hdg:120,len:3353,wid:61},KDTW:{hdg:40,len:3524,wid:61},
  KBOS:{hdg:150,len:3048,wid:61},KPHL:{hdg:90,len:2896,wid:46},
  KLGA:{hdg:40,len:2134,wid:46},KDCA:{hdg:10,len:1587,wid:46},
  KSLC:{hdg:160,len:3657,wid:61},KFLL:{hdg:100,len:2743,wid:46},
  KMCO:{hdg:180,len:3659,wid:61},KSTL:{hdg:120,len:3353,wid:46},
  KCLT:{hdg:180,len:2743,wid:61},KSAN:{hdg:90,len:2865,wid:61},
  KTPA:{hdg:190,len:2987,wid:46},KPDX:{hdg:100,len:2835,wid:61},
  KMEM:{hdg:180,len:3048,wid:61},KBNA:{hdg:200,len:2286,wid:46},
  KAUS:{hdg:180,len:2743,wid:61},KMSY:{hdg:100,len:2743,wid:46},
  KRDU:{hdg:50,len:2743,wid:46},KRIC:{hdg:160,len:2133,wid:46},
  KCMH:{hdg:100,len:3049,wid:61},KIND:{hdg:50,len:2835,wid:46},
  KPIT:{hdg:280,len:3353,wid:61},KSDF:{hdg:170,len:3048,wid:61},
  KSNA:{hdg:200,len:1737,wid:46},KELP:{hdg:220,len:4267,wid:61},
  KABQ:{hdg:30,len:4207,wid:61},KTUS:{hdg:110,len:3292,wid:46},
  KOKC:{hdg:170,len:2743,wid:61},KTUL:{hdg:180,len:2896,wid:46},
  // USA — regional airports
  KBUF:{hdg:230,len:2134,wid:46},KSYR:{hdg:100,len:2286,wid:46},
  KALB:{hdg:190,len:2134,wid:46},KPVD:{hdg:50,len:2134,wid:46},
  KMHT:{hdg:170,len:2134,wid:46},KBGR:{hdg:150,len:3048,wid:61},
  KPWM:{hdg:180,len:1829,wid:46},KHPN:{hdg:160,len:1649,wid:46},
  KTEB:{hdg:190,len:1524,wid:30},KABE:{hdg:240,len:1798,wid:46},
  KAVP:{hdg:220,len:2134,wid:46},KISP:{hdg:100,len:2286,wid:46},
  KHVN:{hdg:20,len:1433,wid:46},
  KMDW:{hdg:130,len:1966,wid:46},KGRR:{hdg:260,len:2286,wid:46},
  KLAN:{hdg:100,len:1981,wid:46},KFTW:{hdg:170,len:1981,wid:46},
  KHOU:{hdg:130,len:2130,wid:46},KSAT:{hdg:120,len:2743,wid:46},
  KCOS:{hdg:170,len:2896,wid:46},KDSM:{hdg:130,len:2682,wid:46},
  KOMA:{hdg:140,len:2682,wid:46},KICT:{hdg:190,len:3048,wid:46},
  KMCI:{hdg:190,len:2987,wid:61},KLIT:{hdg:40,len:2134,wid:46},
  KBHM:{hdg:60,len:2590,wid:46},KMOB:{hdg:150,len:2591,wid:46},
  KJAN:{hdg:160,len:2590,wid:46},KCHA:{hdg:200,len:2134,wid:46},
  KTYS:{hdg:50,len:2560,wid:46},KAVL:{hdg:350,len:2159,wid:46},
  KMYR:{hdg:10,len:2286,wid:46},KCHS:{hdg:150,len:2134,wid:46},
  KSAV:{hdg:100,len:2896,wid:46},KJAX:{hdg:70,len:3048,wid:46},
  KPNS:{hdg:80,len:2316,wid:46},
  KBUR:{hdg:150,len:1887,wid:46},KLGB:{hdg:120,len:1830,wid:46},
  KONT:{hdg:80,len:3658,wid:46},KOAK:{hdg:270,len:3048,wid:61},
  KSJC:{hdg:300,len:3292,wid:61},KSMF:{hdg:200,len:2744,wid:46},
  KFAT:{hdg:290,len:2896,wid:46},KRNO:{hdg:160,len:3353,wid:61},
  KBOI:{hdg:280,len:3048,wid:46},KBZN:{hdg:120,len:2743,wid:46},
  KMSN:{hdg:180,len:2286,wid:46},KFSD:{hdg:210,len:2743,wid:46},
  PHKO:{hdg:170,len:2134,wid:46},PHOG:{hdg:20,len:2896,wid:46},
  PANC:{hdg:150,len:3353,wid:61},PAFA:{hdg:200,len:3204,wid:46},
  PAJN:{hdg:80,len:2134,wid:46},
  // Mexico / Caribbean
  MMMX:{hdg:230,len:4000,wid:61},MMGL:{hdg:280,len:4000,wid:61},
  MMUN:{hdg:120,len:3500,wid:61},MMTY:{hdg:160,len:3000,wid:45},
  MYNN:{hdg:150,len:2113,wid:46},TJSJ:{hdg:100,len:2887,wid:61},
  MDSD:{hdg:170,len:3220,wid:61},
  // South America
  SBGR:{hdg:97,len:3700,wid:61},SCEL:{hdg:170,len:3800,wid:61},
  SKBO:{hdg:140,len:3800,wid:61},SEQM:{hdg:360,len:3120,wid:61},
  SPJC:{hdg:150,len:3507,wid:61},SAEZ:{hdg:110,len:3300,wid:61},
  SBPA:{hdg:290,len:3200,wid:61},SBRJ:{hdg:20,len:1323,wid:46},
  SBSP:{hdg:180,len:1940,wid:45},SBCF:{hdg:160,len:3000,wid:61},
  // Europe
  EGLL:{hdg:270,len:3900,wid:60},EGKK:{hdg:260,len:3316,wid:46},
  EGCC:{hdg:230,len:3048,wid:61},EGNX:{hdg:270,len:2893,wid:46},
  EGBB:{hdg:150,len:2605,wid:46},EGGD:{hdg:270,len:2011,wid:46},
  EGSS:{hdg:220,len:3048,wid:46},EIDW:{hdg:100,len:2637,wid:61},
  LFPG:{hdg:270,len:3600,wid:60},LFPO:{hdg:260,len:2400,wid:46},
  LSZH:{hdg:156,len:3400,wid:60},LSGG:{hdg:230,len:3900,wid:61},
  EHAM:{hdg:183,len:3400,wid:60},EBBR:{hdg:70,len:3638,wid:61},
  EDDF:{hdg:250,len:4000,wid:61},EDDM:{hdg:260,len:4000,wid:61},
  EDDL:{hdg:230,len:3000,wid:61},EDDB:{hdg:70,len:3600,wid:61},
  LEMD:{hdg:180,len:4349,wid:61},LEBL:{hdg:200,len:3743,wid:61},
  LIRF:{hdg:160,len:3900,wid:61},LIML:{hdg:350,len:3000,wid:61},
  LPPT:{hdg:30,len:3805,wid:61},LHBP:{hdg:315,len:3707,wid:61},
  LOWW:{hdg:160,len:3600,wid:61},ESSA:{hdg:80,len:3301,wid:61},
  ENGM:{hdg:190,len:3600,wid:61},EKCH:{hdg:40,len:3300,wid:61},
  EFHK:{hdg:150,len:3200,wid:61},EPWA:{hdg:150,len:3690,wid:61},
  LKPR:{hdg:240,len:3715,wid:61},LYBE:{hdg:120,len:3400,wid:61},
  LGAV:{hdg:30,len:4000,wid:61},LTBA:{hdg:60,len:3000,wid:61},
  LTFM:{hdg:35,len:4100,wid:61},LSZA:{hdg:10,len:1240,wid:46},
  // Eastern Europe / Russia
  UUEE:{hdg:240,len:3700,wid:61},UUDD:{hdg:143,len:3793,wid:61},
  UKBB:{hdg:180,len:4000,wid:61},EVRA:{hdg:180,len:3200,wid:61},
  EYVI:{hdg:10,len:2516,wid:46},UMMS:{hdg:240,len:3650,wid:61},
  LROP:{hdg:80,len:3500,wid:61},LBSF:{hdg:270,len:3600,wid:61},
  // Middle East / Africa
  OMDB:{hdg:121,len:4000,wid:60},OMAA:{hdg:130,len:4100,wid:61},
  OERK:{hdg:155,len:4205,wid:61},OEJN:{hdg:160,len:3800,wid:61},
  OTHH:{hdg:160,len:4850,wid:61},OKBK:{hdg:150,len:3400,wid:61},
  HECA:{hdg:160,len:4000,wid:61},HAAB:{hdg:70,len:3800,wid:61},
  DNMM:{hdg:190,len:3900,wid:61},FAOR:{hdg:30,len:4418,wid:61},
  FACT:{hdg:20,len:3201,wid:61},FMMI:{hdg:120,len:3100,wid:61},
  FCBB:{hdg:60,len:4200,wid:61},HKJK:{hdg:60,len:4207,wid:61},
  HTDA:{hdg:30,len:3700,wid:61},DTTA:{hdg:280,len:3200,wid:61},
  GMME:{hdg:170,len:3700,wid:61},GOOG:{hdg:210,len:2700,wid:46},
  // Asia
  RJTT:{hdg:156,len:3000,wid:60},RJAA:{hdg:340,len:4000,wid:61},
  RKSI:{hdg:150,len:4000,wid:61},RKSS:{hdg:140,len:3200,wid:61},
  ZSPD:{hdg:170,len:4000,wid:61},ZBAA:{hdg:10,len:3800,wid:61},
  ZGGG:{hdg:20,len:3600,wid:61},VHHH:{hdg:70,len:3800,wid:61},
  RCTP:{hdg:60,len:3660,wid:61},WMKK:{hdg:150,len:4124,wid:61},
  WSSS:{hdg:20,len:4000,wid:61},VTBS:{hdg:200,len:4000,wid:61},
  WIII:{hdg:260,len:3600,wid:61},RPLL:{hdg:60,len:3737,wid:61},
  VOMM:{hdg:70,len:3658,wid:61},VIDP:{hdg:270,len:4430,wid:61},
  VABB:{hdg:90,len:3660,wid:61},OPKC:{hdg:70,len:3400,wid:61},
  VCBI:{hdg:40,len:3350,wid:61},OAKB:{hdg:290,len:3600,wid:61},
  UAAA:{hdg:50,len:4000,wid:61},
  // Oceania
  YSSY:{hdg:155,len:3960,wid:60},YMML:{hdg:160,len:3657,wid:61},
  YBBN:{hdg:10,len:3560,wid:61},YPPH:{hdg:210,len:3444,wid:61},
  NZAA:{hdg:50,len:3635,wid:61},NZWN:{hdg:160,len:1935,wid:46},
  NFFN:{hdg:20,len:3000,wid:46},PHNL:{hdg:80,len:3750,wid:61},
  PGUM:{hdg:60,len:3197,wid:61},

  // ===== Special / remote / unusual strips (all approx — verify) =====
  VNLK:{hdg:60,len:527,wid:20},     // Lukla, Nepal (Tenzing-Hillary) — approx, ~2860 m elev
  VNKT:{hdg:20,len:3050,wid:45},    // Kathmandu Tribhuvan — approx
  VQPR:{hdg:150,len:2265,wid:45},   // Paro, Bhutan — approx
  TNCS:{hdg:100,len:400,wid:30},    // Saba (Juancho E. Yrausquin), Caribbean — approx
  TNCM:{hdg:100,len:2180,wid:45},   // Princess Juliana, St. Maarten — approx
  LXGB:{hdg:90,len:1800,wid:45},    // Gibraltar — approx
  LFLJ:{hdg:180,len:525,wid:20},    // Courchevel, France (steep, short) — approx
  EGPR:{hdg:60,len:600,wid:30},     // Barra, Scotland (beach runway) — approx
  LPMA:{hdg:50,len:2781,wid:45},    // Madeira (Funchal) — approx
  SAUS:{hdg:70,len:1800,wid:30},    // Ushuaia, Argentina — approx
});

const LOCS = Object.freeze({
  // North America — Canada — Ontario
  CYYZ:{lat:43.6772,lon:-79.6306,elev:173},  // Toronto Pearson
  CYTZ:{lat:43.6275,lon:-79.3962,elev:77},   // Toronto Billy Bishop (Island)
  CYKF:{lat:43.4608,lon:-80.3786,elev:321},  // Waterloo
  CYOO:{lat:43.9228,lon:-78.8950,elev:137},  // Oshawa
  CYHM:{lat:43.1736,lon:-79.9350,elev:238},  // Hamilton
  CYKZ:{lat:43.8608,lon:-79.3703,elev:190},  // Buttonville (Toronto north)
  CYXU:{lat:43.0356,lon:-81.1531,elev:278},  // London ON
  CYWG:{lat:49.9100,lon:-97.2398,elev:239},  // Winnipeg
  // Canada — Quebec
  CYUL:{lat:45.4706,lon:-73.7408,elev:36},   // Montréal Trudeau
  CYMX:{lat:45.6795,lon:-74.0056,elev:57},   // Montréal Mirabel
  CYHU:{lat:45.5175,lon:-73.4197,elev:27},   // St-Hubert (Longueuil)
  CYQB:{lat:46.7911,lon:-71.3933,elev:74},   // Quebec City
  CYSB:{lat:46.6253,lon:-80.7989,elev:348},  // Sudbury
  // Canada — BC / West
  CYVR:{lat:49.1947,lon:-123.1792,elev:4},   // Vancouver Intl
  CYYJ:{lat:48.6469,lon:-123.4258,elev:19},  // Victoria
  CZBB:{lat:49.0942,lon:-122.3597,elev:2},   // Boundary Bay (Delta BC)
  CYCD:{lat:49.0547,lon:-123.8697,elev:6},   // Nanaimo
  CYXS:{lat:53.8894,lon:-122.6792,elev:691}, // Prince George
  CYXX:{lat:49.0253,lon:-122.3606,elev:58},  // Abbotsford
  // Canada — Alberta / Prairies
  CYYC:{lat:51.1139,lon:-114.0203,elev:1084},// Calgary Intl
  CYBW:{lat:51.1131,lon:-114.3744,elev:1118},// Springbank (Calgary area)
  CYEG:{lat:53.3097,lon:-113.5800,elev:723}, // Edmonton Intl
  CYXD:{lat:53.5728,lon:-113.5214,elev:671}, // Edmonton City Centre (Blatchford)
  CYXE:{lat:52.1333,lon:-106.6667,elev:480}, // Saskatoon
  CYQR:{lat:50.4319,lon:-104.6177,elev:577}, // Regina
  CYBR:{lat:49.9108,lon:-99.9519,elev:357},  // Brandon
  // Canada — East / Maritimes
  CYOW:{lat:45.3225,lon:-75.6692,elev:114},  // Ottawa
  CYYG:{lat:46.2900,lon:-63.1211,elev:55},   // Charlottetown
  CYHZ:{lat:44.8808,lon:-63.5086,elev:145},  // Halifax
  CYQM:{lat:46.1122,lon:-64.6786,elev:71},   // Moncton
  CYFC:{lat:45.8719,lon:-66.5372,elev:34},   // Fredericton
  CYSJ:{lat:45.3161,lon:-65.8900,elev:38},   // Saint John NB
  CYYT:{lat:47.6186,lon:-52.7519,elev:140},  // St. John's NL
  CYGV:{lat:51.3994,lon:-56.0819,elev:48},   // Havre-Saint-Pierre / La Grande Rivière area
  // USA — Northeast / Mid-Atlantic regional
  KBUF:{lat:42.9405,lon:-78.7322,elev:215},  // Buffalo
  KSYR:{lat:43.1112,lon:-76.1063,elev:128},  // Syracuse
  KALB:{lat:42.7483,lon:-73.8017,elev:89},   // Albany
  KPVD:{lat:41.7265,lon:-71.4282,elev:15},   // Providence
  KMHT:{lat:42.9326,lon:-71.4357,elev:81},   // Manchester NH
  KBGR:{lat:44.8074,lon:-68.8282,elev:59},   // Bangor
  KPWM:{lat:43.6462,lon:-70.3093,elev:76},   // Portland ME
  KHPN:{lat:41.0670,lon:-73.7076,elev:122},  // Westchester (White Plains)
  KTEB:{lat:40.8501,lon:-74.0608,elev:3},    // Teterboro NJ (small jets)
  KABE:{lat:40.6521,lon:-75.4408,elev:124},  // Allentown PA
  KAVP:{lat:41.3385,lon:-75.7234,elev:289},  // Scranton/Wilkes-Barre
  KISP:{lat:40.7952,lon:-73.1002,elev:28},   // Long Island MacArthur
  KHVN:{lat:41.2638,lon:-72.8868,elev:4},    // New Haven
  // USA — Midwest regional
  KMDW:{lat:41.7860,lon:-87.7524,elev:188},  // Chicago Midway
  KGRR:{lat:42.8808,lon:-85.5228,elev:245},  // Grand Rapids
  KLAN:{lat:42.7787,lon:-84.5874,elev:282},  // Lansing
  KFTW:{lat:32.8199,lon:-97.3622,elev:218},  // Ft. Worth Meacham
  KHOU:{lat:29.6454,lon:-95.2789,elev:14},   // Houston Hobby
  KSAT:{lat:29.5337,lon:-98.4698,elev:242},  // San Antonio
  KCOS:{lat:38.8058,lon:-104.7008,elev:1881},// Colorado Springs
  KDSM:{lat:41.5340,lon:-93.6631,elev:294},  // Des Moines
  KOMA:{lat:41.3032,lon:-95.8941,elev:299},  // Omaha Eppley
  KICT:{lat:37.6499,lon:-97.4331,elev:408},  // Wichita
  KMCI:{lat:39.2976,lon:-94.7139,elev:313},  // Kansas City
  KLIT:{lat:34.7294,lon:-92.2243,elev:75},   // Little Rock
  // USA — South regional
  KBHM:{lat:33.5629,lon:-86.7535,elev:193},  // Birmingham AL
  KMOB:{lat:30.6912,lon:-88.2428,elev:67},   // Mobile
  KJAN:{lat:32.3112,lon:-90.0759,elev:97},   // Jackson MS
  KCHA:{lat:35.0353,lon:-85.2038,elev:218},  // Chattanooga
  KTYS:{lat:35.8118,lon:-83.9940,elev:293},  // Knoxville
  KAVL:{lat:35.4362,lon:-82.5419,elev:661},  // Asheville NC
  KMYR:{lat:33.6797,lon:-78.9283,elev:9},    // Myrtle Beach
  KCHS:{lat:32.8986,lon:-80.0405,elev:14},   // Charleston SC
  KSAV:{lat:32.1276,lon:-81.2021,elev:15},   // Savannah
  KJAX:{lat:30.4941,lon:-81.6879,elev:9},    // Jacksonville
  KPNS:{lat:30.4734,lon:-87.1866,elev:36},   // Pensacola
  // USA — West regional
  KBUR:{lat:34.2007,lon:-118.3585,elev:238}, // Burbank / Hollywood
  KLGB:{lat:33.8177,lon:-118.1517,elev:18},  // Long Beach
  KONT:{lat:34.0560,lon:-117.6012,elev:288}, // Ontario CA
  KOAK:{lat:37.7213,lon:-122.2208,elev:2},   // Oakland
  KSJC:{lat:37.3626,lon:-121.9290,elev:18},  // San Jose
  KSMF:{lat:38.6954,lon:-121.5908,elev:8},   // Sacramento
  KFAT:{lat:36.7762,lon:-119.7181,elev:102}, // Fresno
  KRNO:{lat:39.4991,lon:-119.7681,elev:1341},// Reno
  KBOI:{lat:43.5644,lon:-116.2228,elev:874}, // Boise
  KBZN:{lat:45.7775,lon:-111.1531,elev:1369},// Bozeman
  KMSN:{lat:43.1399,lon:-89.3375,elev:265},  // Madison WI
  KFSD:{lat:43.5820,lon:-96.7419,elev:437},  // Sioux Falls
  // USA — Hawaii / Alaska
  PHKO:{lat:19.7386,lon:-156.0456,elev:14},  // Kona
  PHOG:{lat:20.8986,lon:-156.4305,elev:49},  // Maui Kahului
  PANC:{lat:61.1744,lon:-149.9964,elev:46},  // Anchorage
  PAFA:{lat:64.8151,lon:-147.8561,elev:135}, // Fairbanks
  PAJN:{lat:58.3550,lon:-134.5763,elev:6},   // Juneau
  // USA — major hubs
  KJFK:{lat:40.6413,lon:-73.7781,elev:4},
  KLAX:{lat:33.9425,lon:-118.4081,elev:38},
  KORD:{lat:41.9742,lon:-87.9073,elev:202},
  KATL:{lat:33.6367,lon:-84.4281,elev:313},
  KDFW:{lat:32.8968,lon:-97.0380,elev:182},
  KDEN:{lat:39.8561,lon:-104.6737,elev:1655},
  KSFO:{lat:37.6213,lon:-122.3790,elev:4},   // San Francisco Intl
  KLAS:{lat:36.0840,lon:-115.1537,elev:664},
  KMIA:{lat:25.7959,lon:-80.2870,elev:3},
  KSEA:{lat:47.4502,lon:-122.3088,elev:132},
  KPHX:{lat:33.4373,lon:-112.0078,elev:337},
  KIAH:{lat:29.9902,lon:-95.3368,elev:30},
  KEWR:{lat:40.6895,lon:-74.1745,elev:9},
  KMSP:{lat:44.8848,lon:-93.2223,elev:256},
  KDTW:{lat:42.2124,lon:-83.3534,elev:195},
  KBOS:{lat:42.3656,lon:-71.0096,elev:9},
  KPHL:{lat:39.8721,lon:-75.2411,elev:11},
  KLGA:{lat:40.7773,lon:-73.8726,elev:7},
  KBWI:{lat:39.1754,lon:-76.6683,elev:46},
  KDCA:{lat:38.8521,lon:-77.0377,elev:15},
  KSLC:{lat:40.7884,lon:-111.9778,elev:1288},
  KFLL:{lat:26.0726,lon:-80.1527,elev:3},
  KMCO:{lat:28.4294,lon:-81.3089,elev:29},
  KSTL:{lat:38.7487,lon:-90.3700,elev:189},
  KCLT:{lat:35.2140,lon:-80.9431,elev:237},
  KSAN:{lat:32.7336,lon:-117.1897,elev:5},
  KTPA:{lat:27.9755,lon:-82.5332,elev:9},
  KPDX:{lat:45.5888,lon:-122.5975,elev:9},
  KMEM:{lat:35.0424,lon:-89.9767,elev:103},
  KBNA:{lat:36.1245,lon:-86.6782,elev:183},
  KAUS:{lat:30.1945,lon:-97.6699,elev:160},
  KMSY:{lat:29.9934,lon:-90.2580,elev:2},
  KRDU:{lat:35.8776,lon:-78.7875,elev:132},
  KRIC:{lat:37.5052,lon:-77.3197,elev:52},
  KCMH:{lat:39.9998,lon:-82.8919,elev:248},
  KPIT:{lat:40.4915,lon:-80.2329,elev:365},
  KIND:{lat:39.7173,lon:-86.2944,elev:246},
  KSNA:{lat:33.6757,lon:-117.8682,elev:17},
  KSDF:{lat:38.1744,lon:-85.7360,elev:149},
  KELP:{lat:31.8072,lon:-106.3779,elev:1194},
  KABQ:{lat:35.0402,lon:-106.6090,elev:1640},
  KTUS:{lat:32.1161,lon:-110.9410,elev:779},
  KOKC:{lat:35.3931,lon:-97.6007,elev:398},
  KTUL:{lat:36.1984,lon:-95.8881,elev:202},
  // Mexico / Caribbean
  MMMX:{lat:19.4363,lon:-99.0721,elev:2237},MMGL:{lat:20.5218,lon:-103.3111,elev:1521},
  MMUN:{lat:21.0365,lon:-86.8771,elev:7},MMTY:{lat:25.7785,lon:-100.1066,elev:366},
  MYNN:{lat:25.0390,lon:-77.4662,elev:5},MBPV:{lat:21.7737,lon:-72.1887,elev:6},
  TJSJ:{lat:18.4394,lon:-66.0018,elev:9},MDSD:{lat:18.4297,lon:-69.6689,elev:17},
  // South America
  SBGR:{lat:-23.4356,lon:-46.4731,elev:750},SCEL:{lat:-33.3930,lon:-70.7858,elev:474},
  SKBO:{lat:4.7016,lon:-74.1469,elev:2549},SEQM:{lat:-0.1292,lon:-78.3576,elev:2400},
  SPJC:{lat:-12.0219,lon:-77.1143,elev:13},SAEZ:{lat:-34.8222,lon:-58.5358,elev:20},
  SBSP:{lat:-23.6261,lon:-46.6564,elev:802},SBPA:{lat:-29.9944,lon:-51.1714,elev:3},
  SBRJ:{lat:-22.9100,lon:-43.1631,elev:9},SBCF:{lat:-19.6244,lon:-43.9719,elev:827},
  // Europe — UK/Ireland
  EGLL:{lat:51.47,lon:-0.4543,elev:25},EGKK:{lat:51.1481,lon:-0.1903,elev:62},
  EGCC:{lat:53.3537,lon:-2.2750,elev:76},EGNX:{lat:52.8311,lon:-1.3281,elev:99},
  EGBB:{lat:52.4539,lon:-1.7480,elev:99},EGGD:{lat:51.3827,lon:-2.7191,elev:189},
  EGSS:{lat:51.8850,lon:0.2350,elev:103},EIDW:{lat:53.4213,lon:-6.2701,elev:74},
  // Europe — Western
  LFPG:{lat:48.9969,lon:2.5483,elev:119},LFPO:{lat:48.7233,lon:2.3794,elev:96},
  LSZH:{lat:47.4647,lon:8.5492,elev:432},LSGG:{lat:46.2381,lon:6.1089,elev:430},
  EHAM:{lat:52.3105,lon:4.7683,elev:-3},EBBR:{lat:50.9014,lon:4.4844,elev:56},
  EDDF:{lat:50.0264,lon:8.5431,elev:111},EDDM:{lat:48.3537,lon:11.7860,elev:448},
  EDDL:{lat:51.2895,lon:6.7668,elev:45},EDDB:{lat:52.3667,lon:13.5033,elev:37},
  LEMD:{lat:40.4936,lon:-3.5668,elev:610},LEBL:{lat:41.2971,lon:2.0785,elev:4},
  LIRF:{lat:41.8003,lon:12.2389,elev:14},LIML:{lat:45.4454,lon:9.2763,elev:107},
  LPPT:{lat:38.7756,lon:-9.1359,elev:113},LHBP:{lat:47.4369,lon:19.2556,elev:151},
  LOWW:{lat:48.1103,lon:16.5697,elev:183},LSZA:{lat:46.0044,lon:8.9109,elev:276},
  ESSA:{lat:59.6519,lon:17.9186,elev:42},ENGM:{lat:60.1939,lon:11.1004,elev:208},
  EKCH:{lat:55.6180,lon:12.6561,elev:17},EFHK:{lat:60.3172,lon:24.9633,elev:55},
  EPWA:{lat:52.1657,lon:20.9671,elev:110},LKPR:{lat:50.1008,lon:14.2600,elev:381},
  LYBE:{lat:44.8184,lon:20.3091,elev:99},LGAV:{lat:37.9364,lon:23.9445,elev:94},
  LTBA:{lat:40.9762,lon:28.8146,elev:157},LTFM:{lat:41.2753,lon:28.7519,elev:99},
  // Europe — Eastern / Russia
  UUEE:{lat:55.9736,lon:37.4125,elev:190},UUDD:{lat:55.4088,lon:37.9063,elev:178},
  UKBB:{lat:50.3450,lon:30.8947,elev:120},EVRA:{lat:56.9236,lon:23.9711,elev:10},
  EYVI:{lat:54.6341,lon:25.2858,elev:197},UMMS:{lat:53.8825,lon:28.0322,elev:204},
  LROP:{lat:44.5722,lon:26.1022,elev:95},LBSF:{lat:42.6967,lon:23.4114,elev:531},
  // Middle East / Africa
  OMDB:{lat:25.2532,lon:55.3657,elev:19},OMAA:{lat:24.4330,lon:54.6511,elev:27},
  OMAB:{lat:24.2528,lon:54.6511,elev:27},    // TODO: same coords as OMAA — verify or remove
  OERK:{lat:24.9576,lon:46.6988,elev:620},OEJN:{lat:21.6796,lon:39.1565,elev:17},
  OTHH:{lat:25.2731,lon:51.6081,elev:13},OKBK:{lat:29.2267,lon:47.9689,elev:55},
  HECA:{lat:30.1219,lon:31.4056,elev:74},HAAB:{lat:8.9779,lon:38.7993,elev:2334},
  DNMM:{lat:6.5774,lon:3.3213,elev:38},FAOR:{lat:-26.1392,lon:28.2460,elev:1694},
  FACT:{lat:-33.9648,lon:18.6017,elev:46},FMMI:{lat:-18.7969,lon:47.4788,elev:1276},
  FCBB:{lat:-4.2517,lon:15.2531,elev:315},GOOG:{lat:14.7447,lon:-17.4902,elev:24},
  DTTA:{lat:36.8510,lon:10.2272,elev:6},GMME:{lat:34.0510,lon:-6.7517,elev:276},
  HKJK:{lat:-1.3192,lon:36.9275,elev:1624},HTDA:{lat:-6.8781,lon:39.2026,elev:55},
  // Asia — East
  RJTT:{lat:35.5494,lon:139.7798,elev:6},RJAA:{lat:35.7647,lon:140.3864,elev:41},
  RKSI:{lat:37.4602,lon:126.4407,elev:23},RKSS:{lat:37.5583,lon:126.7906,elev:18},
  ZSPD:{lat:31.1434,lon:121.8052,elev:4},ZBAA:{lat:40.0799,lon:116.5845,elev:35},
  ZGGG:{lat:23.3924,lon:113.2990,elev:15},VHHH:{lat:22.3080,lon:113.9185,elev:9},
  RCTP:{lat:25.0777,lon:121.2328,elev:33},WMKK:{lat:2.7456,lon:101.7099,elev:21},
  WSSS:{lat:1.3644,lon:103.9915,elev:7},VTBS:{lat:13.9132,lon:100.6070,elev:8},
  WIII:{lat:-6.1256,lon:106.6558,elev:8},RPLL:{lat:14.5086,lon:121.0197,elev:21},
  VOMM:{lat:12.9900,lon:80.1693,elev:16},VIDP:{lat:28.5665,lon:77.1031,elev:237},
  VABB:{lat:19.0896,lon:72.8656,elev:11},
  // Asia — Central / South
  OAKB:{lat:34.5659,lon:69.2123,elev:1791},OPKC:{lat:24.9065,lon:67.1608,elev:22},
  VCBI:{lat:7.1808,lon:79.8841,elev:7},UAAA:{lat:43.3528,lon:77.0405,elev:647},
  UTDD:{lat:38.5433,lon:68.8247,elev:864},
  // Oceania / Pacific
  YSSY:{lat:-33.9399,lon:151.1753,elev:6},YMML:{lat:-37.6733,lon:144.8430,elev:131},
  YBBN:{lat:-27.3842,lon:153.1175,elev:5},YPPH:{lat:-31.9403,lon:115.9669,elev:15},
  NZAA:{lat:-37.0082,lon:174.7917,elev:7},NZWN:{lat:-41.3272,lon:174.8051,elev:12},
  NFFN:{lat:-17.7554,lon:177.4432,elev:5},NTAA:{lat:-17.5534,lon:-149.6062,elev:2},
  PGUM:{lat:13.4834,lon:144.7960,elev:91},PHNL:{lat:21.3245,lon:-157.9251,elev:4},

  // ===== Special / remote / unusual strips (all approx — verify) =====
  VNLK:{lat:27.6867,lon:86.7297,elev:2860},   // Lukla, Nepal — approx
  VNKT:{lat:27.6966,lon:85.3591,elev:1338},   // Kathmandu Tribhuvan — approx
  VQPR:{lat:27.4032,lon:89.4246,elev:2235},   // Paro, Bhutan — approx
  TNCS:{lat:17.6356,lon:-63.2361,elev:600},   // Saba — approx (elev unverified)
  TNCM:{lat:18.0408,lon:-63.1189,elev:13},    // Princess Juliana, St. Maarten — approx
  LXGB:{lat:36.1512,lon:-5.3497,elev:5},      // Gibraltar — approx
  LFLJ:{lat:45.3972,lon:6.6347,elev:2008},    // Courchevel — approx
  EGPR:{lat:57.0055,lon:-7.4437,elev:5},      // Barra, Scotland — approx
  LPMA:{lat:32.6942,lon:-16.7745,elev:58},    // Madeira — approx
  SAUS:{lat:-54.8433,lon:-68.3109,elev:31},   // Ushuaia — approx

  // Scenic (no runway; for map/reference use)
  ALPS:{lat:46.5,lon:7.9,elev:3600},
  EVEREST:{lat:27.9881,lon:86.925,elev:5300},
  GRANDCANYON:{lat:35.9524,lon:-112.147,elev:2000},
  MATTERHORN:{lat:45.9763,lon:7.6586,elev:4300},
  FUJI:{lat:35.3606,lon:138.7274,elev:3700},
  YOSEMITE:{lat:37.7456,lon:-119.5936,elev:1200},
  ZION:{lat:37.2982,lon:-113.0263,elev:1300},
  MONUMENT:{lat:36.9980,lon:-110.0985,elev:1700},
  GEIRANGER:{lat:62.1049,lon:7.2058,elev:0},
  IGUAZU:{lat:-25.6958,lon:-54.4353,elev:185},
  VICTORIA:{lat:-17.9314,lon:25.8564,elev:1000},
  ANTARCTICAPEN:{lat:-63.4,lon:-57.0,elev:0},
  GREENLAND:{lat:72.0,lon:-40.0,elev:2000},
});

// Consistency check: every runway airport should have a location.
for (const icao of Object.keys(RUNWAYS)) {
  if (!LOCS[icao]) console.warn(`No LOCS entry for ${icao}`);
}
