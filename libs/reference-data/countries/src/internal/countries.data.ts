export const COUNTRY_LOCALES = ['en', 'ru'] as const;
export type CountryLocale = (typeof COUNTRY_LOCALES)[number];

export type CountryRecord = {
  alpha2: string;
  alpha3: string;
  names: Readonly<Record<CountryLocale, string>>;
  aliases?: readonly string[];
};

export const COUNTRIES: readonly CountryRecord[] = [
  {
    alpha2: 'AF',
    alpha3: 'AFG',
    names: { en: 'Afghanistan', ru: 'Афганистан' },
  },
  {
    alpha2: 'AX',
    alpha3: 'ALA',
    names: { en: 'Åland Islands', ru: 'Аландских островов' },
  },
  {
    alpha2: 'AL',
    alpha3: 'ALB',
    names: { en: 'Albania', ru: 'Албания' },
  },
  {
    alpha2: 'DZ',
    alpha3: 'DZA',
    names: { en: 'Algeria', ru: 'Алжир' },
  },
  {
    alpha2: 'AS',
    alpha3: 'ASM',
    names: { en: 'American Samoa', ru: 'Американское Самоа' },
  },
  {
    alpha2: 'AD',
    alpha3: 'AND',
    names: { en: 'Andorra', ru: 'Андорра' },
  },
  {
    alpha2: 'AO',
    alpha3: 'AGO',
    names: { en: 'Angola', ru: 'Ангола' },
  },
  {
    alpha2: 'AI',
    alpha3: 'AIA',
    names: { en: 'Anguilla', ru: 'Ангилья' },
  },
  {
    alpha2: 'AQ',
    alpha3: 'ATA',
    names: { en: 'Antarctica', ru: 'Антарктике' },
  },
  {
    alpha2: 'AG',
    alpha3: 'ATG',
    names: { en: 'Antigua and Barbuda', ru: 'Антигуа и Барбуда' },
  },
  {
    alpha2: 'AR',
    alpha3: 'ARG',
    names: { en: 'Argentina', ru: 'Аргентина' },
  },
  {
    alpha2: 'AM',
    alpha3: 'ARM',
    names: { en: 'Armenia', ru: 'Армения' },
  },
  {
    alpha2: 'AW',
    alpha3: 'ABW',
    names: { en: 'Aruba', ru: 'Аруба' },
  },
  {
    alpha2: 'AU',
    alpha3: 'AUS',
    names: { en: 'Australia', ru: 'Австралия' },
  },
  {
    alpha2: 'AT',
    alpha3: 'AUT',
    names: { en: 'Austria', ru: 'Австрия' },
  },
  {
    alpha2: 'AZ',
    alpha3: 'AZE',
    names: { en: 'Azerbaijan', ru: 'Азербайджан' },
  },
  {
    alpha2: 'BS',
    alpha3: 'BHS',
    names: { en: 'Bahamas', ru: 'Багамские Острова' },
  },
  {
    alpha2: 'BH',
    alpha3: 'BHR',
    names: { en: 'Bahrain', ru: 'Бахрейн' },
  },
  {
    alpha2: 'BD',
    alpha3: 'BGD',
    names: { en: 'Bangladesh', ru: 'Бангладеш' },
  },
  {
    alpha2: 'BB',
    alpha3: 'BRB',
    names: { en: 'Barbados', ru: 'Барбадос' },
  },
  {
    alpha2: 'BY',
    alpha3: 'BLR',
    names: { en: 'Belarus', ru: 'Беларусь' },
    aliases: ['Белоруссия'],
  },
  {
    alpha2: 'BE',
    alpha3: 'BEL',
    names: { en: 'Belgium', ru: 'Бельгия' },
  },
  {
    alpha2: 'BZ',
    alpha3: 'BLZ',
    names: { en: 'Belize', ru: 'Белиз' },
  },
  {
    alpha2: 'BJ',
    alpha3: 'BEN',
    names: { en: 'Benin', ru: 'Бенин' },
  },
  {
    alpha2: 'BM',
    alpha3: 'BMU',
    names: { en: 'Bermuda', ru: 'Бермудские острова' },
  },
  {
    alpha2: 'BT',
    alpha3: 'BTN',
    names: { en: 'Bhutan', ru: 'Бутан' },
  },
  {
    alpha2: 'BO',
    alpha3: 'BOL',
    names: { en: 'Bolivia (Plurinational State of)', ru: 'Боливия (Многонациональное Государство)' },
  },
  {
    alpha2: 'BQ',
    alpha3: 'BES',
    names: { en: 'Bonaire, Sint Eustatius and Saba', ru: 'Бонайре, Синт-Эстатиус и Саба' },
  },
  {
    alpha2: 'BA',
    alpha3: 'BIH',
    names: { en: 'Bosnia and Herzegovina', ru: 'Босния и Герцеговина' },
  },
  {
    alpha2: 'BW',
    alpha3: 'BWA',
    names: { en: 'Botswana', ru: 'Ботсвана' },
  },
  {
    alpha2: 'BV',
    alpha3: 'BVT',
    names: { en: 'Bouvet Island', ru: 'Остров Буве' },
  },
  {
    alpha2: 'BR',
    alpha3: 'BRA',
    names: { en: 'Brazil', ru: 'Бразилия' },
  },
  {
    alpha2: 'IO',
    alpha3: 'IOT',
    names: { en: 'British Indian Ocean Territory', ru: 'Британская территория в Индийском океане' },
  },
  {
    alpha2: 'VG',
    alpha3: 'VGB',
    names: { en: 'British Virgin Islands', ru: 'Британские Виргинские острова' },
  },
  {
    alpha2: 'BN',
    alpha3: 'BRN',
    names: { en: 'Brunei Darussalam', ru: 'Бруней-Даруссалам' },
  },
  {
    alpha2: 'BG',
    alpha3: 'BGR',
    names: { en: 'Bulgaria', ru: 'Болгария' },
  },
  {
    alpha2: 'BF',
    alpha3: 'BFA',
    names: { en: 'Burkina Faso', ru: 'Буркина-Фасо' },
  },
  {
    alpha2: 'BI',
    alpha3: 'BDI',
    names: { en: 'Burundi', ru: 'Бурунди' },
  },
  {
    alpha2: 'CV',
    alpha3: 'CPV',
    names: { en: 'Cabo Verde', ru: 'Кабо-Верде' },
  },
  {
    alpha2: 'KH',
    alpha3: 'KHM',
    names: { en: 'Cambodia', ru: 'Камбоджа' },
  },
  {
    alpha2: 'CM',
    alpha3: 'CMR',
    names: { en: 'Cameroon', ru: 'Камерун' },
  },
  {
    alpha2: 'CA',
    alpha3: 'CAN',
    names: { en: 'Canada', ru: 'Канада' },
  },
  {
    alpha2: 'KY',
    alpha3: 'CYM',
    names: { en: 'Cayman Islands', ru: 'Кайман острова' },
  },
  {
    alpha2: 'CF',
    alpha3: 'CAF',
    names: { en: 'Central African Republic', ru: 'Центральноафриканская Республика' },
  },
  {
    alpha2: 'TD',
    alpha3: 'TCD',
    names: { en: 'Chad', ru: 'Чад' },
  },
  {
    alpha2: 'CL',
    alpha3: 'CHL',
    names: { en: 'Chile', ru: 'Чили' },
  },
  {
    alpha2: 'CN',
    alpha3: 'CHN',
    names: { en: 'China', ru: 'Китай' },
    aliases: ["People's Republic of China", 'КНР'],
  },
  {
    alpha2: 'HK',
    alpha3: 'HKG',
    names: {
      en: 'China, Hong Kong Special Administrative Region',
      ru: 'Китай, Специальный административный район Гонконг',
    },
  },
  {
    alpha2: 'MO',
    alpha3: 'MAC',
    names: {
      en: 'China, Macao Special Administrative Region',
      ru: 'Китай, Специальный административный район Макао',
    },
  },
  {
    alpha2: 'CX',
    alpha3: 'CXR',
    names: { en: 'Christmas Island', ru: 'остров Рождества' },
  },
  {
    alpha2: 'CC',
    alpha3: 'CCK',
    names: { en: 'Cocos (Keeling) Islands', ru: 'Кокосовых (Килинг) островов' },
  },
  {
    alpha2: 'CO',
    alpha3: 'COL',
    names: { en: 'Colombia', ru: 'Колумбия' },
  },
  {
    alpha2: 'KM',
    alpha3: 'COM',
    names: { en: 'Comoros', ru: 'Коморские Острова' },
  },
  {
    alpha2: 'CG',
    alpha3: 'COG',
    names: { en: 'Congo', ru: 'Конго' },
  },
  {
    alpha2: 'CK',
    alpha3: 'COK',
    names: { en: 'Cook Islands', ru: 'Острова Кука' },
  },
  {
    alpha2: 'CR',
    alpha3: 'CRI',
    names: { en: 'Costa Rica', ru: 'Коста-Рика' },
  },
  {
    alpha2: 'CI',
    alpha3: 'CIV',
    names: { en: 'Côte d’Ivoire', ru: "Кот-д'Ивуар" },
  },
  {
    alpha2: 'HR',
    alpha3: 'HRV',
    names: { en: 'Croatia', ru: 'Хорватия' },
  },
  {
    alpha2: 'CU',
    alpha3: 'CUB',
    names: { en: 'Cuba', ru: 'Куба' },
  },
  {
    alpha2: 'CW',
    alpha3: 'CUW',
    names: { en: 'Curaçao', ru: 'Кюрасао' },
  },
  {
    alpha2: 'CY',
    alpha3: 'CYP',
    names: { en: 'Cyprus', ru: 'Кипр' },
  },
  {
    alpha2: 'CZ',
    alpha3: 'CZE',
    names: { en: 'Czechia', ru: 'Чехия' },
    aliases: ['Czech Republic', 'Чешская Республика'],
  },
  {
    alpha2: 'KP',
    alpha3: 'PRK',
    names: {
      en: "Democratic People's Republic of Korea",
      ru: 'Корейская Народно-Демократическая Республика',
    },
  },
  {
    alpha2: 'CD',
    alpha3: 'COD',
    names: { en: 'Democratic Republic of the Congo', ru: 'Демократическая Республика Конго' },
  },
  {
    alpha2: 'DK',
    alpha3: 'DNK',
    names: { en: 'Denmark', ru: 'Дания' },
  },
  {
    alpha2: 'DJ',
    alpha3: 'DJI',
    names: { en: 'Djibouti', ru: 'Джибути' },
  },
  {
    alpha2: 'DM',
    alpha3: 'DMA',
    names: { en: 'Dominica', ru: 'Доминика' },
  },
  {
    alpha2: 'DO',
    alpha3: 'DOM',
    names: { en: 'Dominican Republic', ru: 'Доминиканская Республика' },
  },
  {
    alpha2: 'EC',
    alpha3: 'ECU',
    names: { en: 'Ecuador', ru: 'Эквадор' },
  },
  {
    alpha2: 'EG',
    alpha3: 'EGY',
    names: { en: 'Egypt', ru: 'Египет' },
  },
  {
    alpha2: 'SV',
    alpha3: 'SLV',
    names: { en: 'El Salvador', ru: 'Сальвадор' },
  },
  {
    alpha2: 'GQ',
    alpha3: 'GNQ',
    names: { en: 'Equatorial Guinea', ru: 'Экваториальная Гвинея' },
  },
  {
    alpha2: 'ER',
    alpha3: 'ERI',
    names: { en: 'Eritrea', ru: 'Эритрея' },
  },
  {
    alpha2: 'EE',
    alpha3: 'EST',
    names: { en: 'Estonia', ru: 'Эстония' },
  },
  {
    alpha2: 'SZ',
    alpha3: 'SWZ',
    names: { en: 'Eswatini', ru: 'Эсватини' },
  },
  {
    alpha2: 'ET',
    alpha3: 'ETH',
    names: { en: 'Ethiopia', ru: 'Эфиопия' },
  },
  {
    alpha2: 'FK',
    alpha3: 'FLK',
    names: { en: 'Falkland Islands (Malvinas)', ru: 'Фолклендские (Мальвинские) острова' },
  },
  {
    alpha2: 'FO',
    alpha3: 'FRO',
    names: { en: 'Faroe Islands', ru: 'Фарерские острова' },
  },
  {
    alpha2: 'FJ',
    alpha3: 'FJI',
    names: { en: 'Fiji', ru: 'Фиджи' },
  },
  {
    alpha2: 'FI',
    alpha3: 'FIN',
    names: { en: 'Finland', ru: 'Финляндия' },
  },
  {
    alpha2: 'FR',
    alpha3: 'FRA',
    names: { en: 'France', ru: 'Франция' },
  },
  {
    alpha2: 'GF',
    alpha3: 'GUF',
    names: { en: 'French Guiana', ru: 'Французская Гвиана' },
  },
  {
    alpha2: 'PF',
    alpha3: 'PYF',
    names: { en: 'French Polynesia', ru: 'Французская Полинезия' },
  },
  {
    alpha2: 'TF',
    alpha3: 'ATF',
    names: { en: 'French Southern Territories', ru: 'Южные земли (французская заморская территория)' },
  },
  {
    alpha2: 'GA',
    alpha3: 'GAB',
    names: { en: 'Gabon', ru: 'Габон' },
  },
  {
    alpha2: 'GM',
    alpha3: 'GMB',
    names: { en: 'Gambia', ru: 'Гамбия' },
  },
  {
    alpha2: 'GE',
    alpha3: 'GEO',
    names: { en: 'Georgia', ru: 'Грузия' },
  },
  {
    alpha2: 'DE',
    alpha3: 'DEU',
    names: { en: 'Germany', ru: 'Германия' },
  },
  {
    alpha2: 'GH',
    alpha3: 'GHA',
    names: { en: 'Ghana', ru: 'Гана' },
  },
  {
    alpha2: 'GI',
    alpha3: 'GIB',
    names: { en: 'Gibraltar', ru: 'Гибралтар' },
  },
  {
    alpha2: 'GR',
    alpha3: 'GRC',
    names: { en: 'Greece', ru: 'Греция' },
  },
  {
    alpha2: 'GL',
    alpha3: 'GRL',
    names: { en: 'Greenland', ru: 'Гренландия' },
  },
  {
    alpha2: 'GD',
    alpha3: 'GRD',
    names: { en: 'Grenada', ru: 'Гренада' },
  },
  {
    alpha2: 'GP',
    alpha3: 'GLP',
    names: { en: 'Guadeloupe', ru: 'Гваделупа' },
  },
  {
    alpha2: 'GU',
    alpha3: 'GUM',
    names: { en: 'Guam', ru: 'Гуам' },
  },
  {
    alpha2: 'GT',
    alpha3: 'GTM',
    names: { en: 'Guatemala', ru: 'Гватемала' },
  },
  {
    alpha2: 'GG',
    alpha3: 'GGY',
    names: { en: 'Guernsey', ru: 'Гернси' },
  },
  {
    alpha2: 'GN',
    alpha3: 'GIN',
    names: { en: 'Guinea', ru: 'Гвинея' },
  },
  {
    alpha2: 'GW',
    alpha3: 'GNB',
    names: { en: 'Guinea-Bissau', ru: 'Гвинея-Бисау' },
  },
  {
    alpha2: 'GY',
    alpha3: 'GUY',
    names: { en: 'Guyana', ru: 'Гайана' },
  },
  {
    alpha2: 'HT',
    alpha3: 'HTI',
    names: { en: 'Haiti', ru: 'Гаити' },
  },
  {
    alpha2: 'HM',
    alpha3: 'HMD',
    names: { en: 'Heard Island and McDonald Islands', ru: 'Остров Херд и острова Макдональд' },
  },
  {
    alpha2: 'VA',
    alpha3: 'VAT',
    names: { en: 'Holy See', ru: 'Святой Престол' },
  },
  {
    alpha2: 'HN',
    alpha3: 'HND',
    names: { en: 'Honduras', ru: 'Гондурас' },
  },
  {
    alpha2: 'HU',
    alpha3: 'HUN',
    names: { en: 'Hungary', ru: 'Венгрия' },
  },
  {
    alpha2: 'IS',
    alpha3: 'ISL',
    names: { en: 'Iceland', ru: 'Исландия' },
  },
  {
    alpha2: 'IN',
    alpha3: 'IND',
    names: { en: 'India', ru: 'Индия' },
  },
  {
    alpha2: 'ID',
    alpha3: 'IDN',
    names: { en: 'Indonesia', ru: 'Индонезия' },
  },
  {
    alpha2: 'IR',
    alpha3: 'IRN',
    names: { en: 'Iran (Islamic Republic of)', ru: 'Иран (Исламская Республика)' },
  },
  {
    alpha2: 'IQ',
    alpha3: 'IRQ',
    names: { en: 'Iraq', ru: 'Ирак' },
  },
  {
    alpha2: 'IE',
    alpha3: 'IRL',
    names: { en: 'Ireland', ru: 'Ирландия' },
  },
  {
    alpha2: 'IM',
    alpha3: 'IMN',
    names: { en: 'Isle of Man', ru: 'Остров Мэн' },
  },
  {
    alpha2: 'IL',
    alpha3: 'ISR',
    names: { en: 'Israel', ru: 'Израиль' },
  },
  {
    alpha2: 'IT',
    alpha3: 'ITA',
    names: { en: 'Italy', ru: 'Италия' },
  },
  {
    alpha2: 'JM',
    alpha3: 'JAM',
    names: { en: 'Jamaica', ru: 'Ямайка' },
  },
  {
    alpha2: 'JP',
    alpha3: 'JPN',
    names: { en: 'Japan', ru: 'Япония' },
  },
  {
    alpha2: 'JE',
    alpha3: 'JEY',
    names: { en: 'Jersey', ru: 'Джерси' },
  },
  {
    alpha2: 'JO',
    alpha3: 'JOR',
    names: { en: 'Jordan', ru: 'Иордания' },
  },
  {
    alpha2: 'KZ',
    alpha3: 'KAZ',
    names: { en: 'Kazakhstan', ru: 'Казахстан' },
  },
  {
    alpha2: 'KE',
    alpha3: 'KEN',
    names: { en: 'Kenya', ru: 'Кения' },
  },
  {
    alpha2: 'KI',
    alpha3: 'KIR',
    names: { en: 'Kiribati', ru: 'Кирибати' },
  },
  {
    alpha2: 'KW',
    alpha3: 'KWT',
    names: { en: 'Kuwait', ru: 'Кувейт' },
  },
  {
    alpha2: 'KG',
    alpha3: 'KGZ',
    names: { en: 'Kyrgyzstan', ru: 'Кыргызстан' },
    aliases: ['Киргизия'],
  },
  {
    alpha2: 'LA',
    alpha3: 'LAO',
    names: { en: "Lao People's Democratic Republic", ru: 'Лаосская Народно-Демократическая Республика' },
  },
  {
    alpha2: 'LV',
    alpha3: 'LVA',
    names: { en: 'Latvia', ru: 'Латвия' },
  },
  {
    alpha2: 'LB',
    alpha3: 'LBN',
    names: { en: 'Lebanon', ru: 'Ливан' },
  },
  {
    alpha2: 'LS',
    alpha3: 'LSO',
    names: { en: 'Lesotho', ru: 'Лесото' },
  },
  {
    alpha2: 'LR',
    alpha3: 'LBR',
    names: { en: 'Liberia', ru: 'Либерия' },
  },
  {
    alpha2: 'LY',
    alpha3: 'LBY',
    names: { en: 'Libya', ru: 'Ливия' },
  },
  {
    alpha2: 'LI',
    alpha3: 'LIE',
    names: { en: 'Liechtenstein', ru: 'Лихтенштейн' },
  },
  {
    alpha2: 'LT',
    alpha3: 'LTU',
    names: { en: 'Lithuania', ru: 'Литва' },
  },
  {
    alpha2: 'LU',
    alpha3: 'LUX',
    names: { en: 'Luxembourg', ru: 'Люксембург' },
  },
  {
    alpha2: 'MG',
    alpha3: 'MDG',
    names: { en: 'Madagascar', ru: 'Мадагаскар' },
  },
  {
    alpha2: 'MW',
    alpha3: 'MWI',
    names: { en: 'Malawi', ru: 'Малави' },
  },
  {
    alpha2: 'MY',
    alpha3: 'MYS',
    names: { en: 'Malaysia', ru: 'Малайзия' },
  },
  {
    alpha2: 'MV',
    alpha3: 'MDV',
    names: { en: 'Maldives', ru: 'Мальдивские Острова' },
  },
  {
    alpha2: 'ML',
    alpha3: 'MLI',
    names: { en: 'Mali', ru: 'Мали' },
  },
  {
    alpha2: 'MT',
    alpha3: 'MLT',
    names: { en: 'Malta', ru: 'Мальта' },
  },
  {
    alpha2: 'MH',
    alpha3: 'MHL',
    names: { en: 'Marshall Islands', ru: 'Маршалловы Острова' },
  },
  {
    alpha2: 'MQ',
    alpha3: 'MTQ',
    names: { en: 'Martinique', ru: 'Мартиника' },
  },
  {
    alpha2: 'MR',
    alpha3: 'MRT',
    names: { en: 'Mauritania', ru: 'Мавритания' },
  },
  {
    alpha2: 'MU',
    alpha3: 'MUS',
    names: { en: 'Mauritius', ru: 'Маврикий' },
  },
  {
    alpha2: 'YT',
    alpha3: 'MYT',
    names: { en: 'Mayotte', ru: 'Остров Майотта' },
  },
  {
    alpha2: 'MX',
    alpha3: 'MEX',
    names: { en: 'Mexico', ru: 'Мексика' },
  },
  {
    alpha2: 'FM',
    alpha3: 'FSM',
    names: { en: 'Micronesia (Federated States of)', ru: 'Микронезия (Федеративные Штаты)' },
  },
  {
    alpha2: 'MC',
    alpha3: 'MCO',
    names: { en: 'Monaco', ru: 'Монако' },
  },
  {
    alpha2: 'MN',
    alpha3: 'MNG',
    names: { en: 'Mongolia', ru: 'Монголия' },
  },
  {
    alpha2: 'ME',
    alpha3: 'MNE',
    names: { en: 'Montenegro', ru: 'Черногория' },
  },
  {
    alpha2: 'MS',
    alpha3: 'MSR',
    names: { en: 'Montserrat', ru: 'Монтсеррат' },
  },
  {
    alpha2: 'MA',
    alpha3: 'MAR',
    names: { en: 'Morocco', ru: 'Марокко' },
  },
  {
    alpha2: 'MZ',
    alpha3: 'MOZ',
    names: { en: 'Mozambique', ru: 'Мозамбик' },
  },
  {
    alpha2: 'MM',
    alpha3: 'MMR',
    names: { en: 'Myanmar', ru: 'Мьянма' },
  },
  {
    alpha2: 'NA',
    alpha3: 'NAM',
    names: { en: 'Namibia', ru: 'Намибия' },
  },
  {
    alpha2: 'NR',
    alpha3: 'NRU',
    names: { en: 'Naoero', ru: 'Наоэро' },
  },
  {
    alpha2: 'NP',
    alpha3: 'NPL',
    names: { en: 'Nepal', ru: 'Непал' },
  },
  {
    alpha2: 'NL',
    alpha3: 'NLD',
    names: { en: 'Netherlands (Kingdom of the)', ru: 'Нидерланды (Королевство)' },
    aliases: ['Holland', 'Голландия'],
  },
  {
    alpha2: 'NC',
    alpha3: 'NCL',
    names: { en: 'New Caledonia', ru: 'Новая Каледония' },
  },
  {
    alpha2: 'NZ',
    alpha3: 'NZL',
    names: { en: 'New Zealand', ru: 'Новая Зеландия' },
  },
  {
    alpha2: 'NI',
    alpha3: 'NIC',
    names: { en: 'Nicaragua', ru: 'Никарагуа' },
  },
  {
    alpha2: 'NE',
    alpha3: 'NER',
    names: { en: 'Niger', ru: 'Нигер' },
  },
  {
    alpha2: 'NG',
    alpha3: 'NGA',
    names: { en: 'Nigeria', ru: 'Нигерия' },
  },
  {
    alpha2: 'NU',
    alpha3: 'NIU',
    names: { en: 'Niue', ru: 'Ниуэ' },
  },
  {
    alpha2: 'NF',
    alpha3: 'NFK',
    names: { en: 'Norfolk Island', ru: 'Остров Норфолк' },
  },
  {
    alpha2: 'MK',
    alpha3: 'MKD',
    names: { en: 'North Macedonia', ru: 'Северная Македония' },
  },
  {
    alpha2: 'MP',
    alpha3: 'MNP',
    names: { en: 'Northern Mariana Islands', ru: 'Северные Марианские острова' },
  },
  {
    alpha2: 'NO',
    alpha3: 'NOR',
    names: { en: 'Norway', ru: 'Норвегия' },
  },
  {
    alpha2: 'OM',
    alpha3: 'OMN',
    names: { en: 'Oman', ru: 'Оман' },
  },
  {
    alpha2: 'PK',
    alpha3: 'PAK',
    names: { en: 'Pakistan', ru: 'Пакистан' },
  },
  {
    alpha2: 'PW',
    alpha3: 'PLW',
    names: { en: 'Palau', ru: 'Палау' },
  },
  {
    alpha2: 'PA',
    alpha3: 'PAN',
    names: { en: 'Panama', ru: 'Панама' },
  },
  {
    alpha2: 'PG',
    alpha3: 'PNG',
    names: { en: 'Papua New Guinea', ru: 'Папуа-Новая Гвинея' },
  },
  {
    alpha2: 'PY',
    alpha3: 'PRY',
    names: { en: 'Paraguay', ru: 'Парагвай' },
  },
  {
    alpha2: 'PE',
    alpha3: 'PER',
    names: { en: 'Peru', ru: 'Перу' },
  },
  {
    alpha2: 'PH',
    alpha3: 'PHL',
    names: { en: 'Philippines', ru: 'Филиппины' },
  },
  {
    alpha2: 'PN',
    alpha3: 'PCN',
    names: { en: 'Pitcairn', ru: 'Питкэрн' },
  },
  {
    alpha2: 'PL',
    alpha3: 'POL',
    names: { en: 'Poland', ru: 'Польша' },
  },
  {
    alpha2: 'PT',
    alpha3: 'PRT',
    names: { en: 'Portugal', ru: 'Португалия' },
  },
  {
    alpha2: 'PR',
    alpha3: 'PRI',
    names: { en: 'Puerto Rico', ru: 'Пуэрто-Рико' },
  },
  {
    alpha2: 'QA',
    alpha3: 'QAT',
    names: { en: 'Qatar', ru: 'Катар' },
  },
  {
    alpha2: 'KR',
    alpha3: 'KOR',
    names: { en: 'Republic of Korea', ru: 'Республика Корея' },
    aliases: ['South Korea', 'Республика Корея'],
  },
  {
    alpha2: 'MD',
    alpha3: 'MDA',
    names: { en: 'Republic of Moldova', ru: 'Республика Молдова' },
    aliases: ['Молдавия'],
  },
  {
    alpha2: 'RE',
    alpha3: 'REU',
    names: { en: 'Réunion', ru: 'Реюньон' },
  },
  {
    alpha2: 'RO',
    alpha3: 'ROU',
    names: { en: 'Romania', ru: 'Румыния' },
  },
  {
    alpha2: 'RU',
    alpha3: 'RUS',
    names: { en: 'Russian Federation', ru: 'Российская Федерация' },
    aliases: ['Russia', 'Российская Федерация'],
  },
  {
    alpha2: 'RW',
    alpha3: 'RWA',
    names: { en: 'Rwanda', ru: 'Руанда' },
  },
  {
    alpha2: 'BL',
    alpha3: 'BLM',
    names: { en: 'Saint Barthélemy', ru: 'Сен-Бартелеми' },
  },
  {
    alpha2: 'SH',
    alpha3: 'SHN',
    names: { en: 'Saint Helena', ru: 'Остров Святой Елены' },
  },
  {
    alpha2: 'KN',
    alpha3: 'KNA',
    names: { en: 'Saint Kitts and Nevis', ru: 'Сент-Китс и Невис' },
  },
  {
    alpha2: 'LC',
    alpha3: 'LCA',
    names: { en: 'Saint Lucia', ru: 'Сент-Люсия' },
  },
  {
    alpha2: 'MF',
    alpha3: 'MAF',
    names: { en: 'Saint Martin (French Part)', ru: 'Сен-Мартен (французская часть)' },
  },
  {
    alpha2: 'PM',
    alpha3: 'SPM',
    names: { en: 'Saint Pierre and Miquelon', ru: 'Сен-Пьер и Микелон' },
  },
  {
    alpha2: 'VC',
    alpha3: 'VCT',
    names: { en: 'Saint Vincent and the Grenadines', ru: 'Сент-Винсент и Гренадины' },
  },
  {
    alpha2: 'WS',
    alpha3: 'WSM',
    names: { en: 'Samoa', ru: 'Самоа' },
  },
  {
    alpha2: 'SM',
    alpha3: 'SMR',
    names: { en: 'San Marino', ru: 'Сан-Марино' },
  },
  {
    alpha2: 'ST',
    alpha3: 'STP',
    names: { en: 'Sao Tome and Principe', ru: 'Сан-Томе и Принсипи' },
  },
  {
    alpha2: 'SA',
    alpha3: 'SAU',
    names: { en: 'Saudi Arabia', ru: 'Саудовская Аравия' },
  },
  {
    alpha2: 'SN',
    alpha3: 'SEN',
    names: { en: 'Senegal', ru: 'Сенегал' },
  },
  {
    alpha2: 'RS',
    alpha3: 'SRB',
    names: { en: 'Serbia', ru: 'Сербия' },
  },
  {
    alpha2: 'SC',
    alpha3: 'SYC',
    names: { en: 'Seychelles', ru: 'Сейшельские Острова' },
  },
  {
    alpha2: 'SL',
    alpha3: 'SLE',
    names: { en: 'Sierra Leone', ru: 'Сьерра-Леоне' },
  },
  {
    alpha2: 'SG',
    alpha3: 'SGP',
    names: { en: 'Singapore', ru: 'Сингапур' },
  },
  {
    alpha2: 'SX',
    alpha3: 'SXM',
    names: { en: 'Sint Maarten (Dutch part)', ru: 'Синт-Мартен (нидерландская часть)' },
  },
  {
    alpha2: 'SK',
    alpha3: 'SVK',
    names: { en: 'Slovakia', ru: 'Словакия' },
  },
  {
    alpha2: 'SI',
    alpha3: 'SVN',
    names: { en: 'Slovenia', ru: 'Словения' },
  },
  {
    alpha2: 'SB',
    alpha3: 'SLB',
    names: { en: 'Solomon Islands', ru: 'Соломоновы Острова' },
  },
  {
    alpha2: 'SO',
    alpha3: 'SOM',
    names: { en: 'Somalia', ru: 'Сомали' },
  },
  {
    alpha2: 'ZA',
    alpha3: 'ZAF',
    names: { en: 'South Africa', ru: 'Южная Африка' },
    aliases: ['Republic of South Africa', 'ЮАР'],
  },
  {
    alpha2: 'GS',
    alpha3: 'SGS',
    names: {
      en: 'South Georgia and the South Sandwich Islands',
      ru: 'Южная Джорджия и Южные Сандвичевы острова',
    },
  },
  {
    alpha2: 'SS',
    alpha3: 'SSD',
    names: { en: 'South Sudan', ru: 'Южный Судан' },
  },
  {
    alpha2: 'ES',
    alpha3: 'ESP',
    names: { en: 'Spain', ru: 'Испания' },
  },
  {
    alpha2: 'LK',
    alpha3: 'LKA',
    names: { en: 'Sri Lanka', ru: 'Шри-Ланка' },
  },
  {
    alpha2: 'PS',
    alpha3: 'PSE',
    names: { en: 'State of Palestine', ru: 'Государство Палестина' },
  },
  {
    alpha2: 'SD',
    alpha3: 'SDN',
    names: { en: 'Sudan', ru: 'Судан' },
  },
  {
    alpha2: 'SR',
    alpha3: 'SUR',
    names: { en: 'Suriname', ru: 'Суринам' },
  },
  {
    alpha2: 'SJ',
    alpha3: 'SJM',
    names: { en: 'Svalbard and Jan Mayen Islands', ru: 'Острова Свальбард и Ян-Майен' },
  },
  {
    alpha2: 'SE',
    alpha3: 'SWE',
    names: { en: 'Sweden', ru: 'Швеция' },
  },
  {
    alpha2: 'CH',
    alpha3: 'CHE',
    names: { en: 'Switzerland', ru: 'Швейцария' },
  },
  {
    alpha2: 'SY',
    alpha3: 'SYR',
    names: { en: 'Syrian Arab Republic', ru: 'Сирийская Арабская Республика' },
  },
  {
    alpha2: 'TW',
    alpha3: 'TWN',
    names: { en: 'Taiwan', ru: 'Тайвань' },
  },
  {
    alpha2: 'TJ',
    alpha3: 'TJK',
    names: { en: 'Tajikistan', ru: 'Таджикистан' },
  },
  {
    alpha2: 'TH',
    alpha3: 'THA',
    names: { en: 'Thailand', ru: 'Таиланд' },
  },
  {
    alpha2: 'TL',
    alpha3: 'TLS',
    names: { en: 'Timor-Leste', ru: 'Тимор-Лешти' },
  },
  {
    alpha2: 'TG',
    alpha3: 'TGO',
    names: { en: 'Togo', ru: 'Того' },
  },
  {
    alpha2: 'TK',
    alpha3: 'TKL',
    names: { en: 'Tokelau', ru: 'Токелау' },
  },
  {
    alpha2: 'TO',
    alpha3: 'TON',
    names: { en: 'Tonga', ru: 'Тонга' },
  },
  {
    alpha2: 'TT',
    alpha3: 'TTO',
    names: { en: 'Trinidad and Tobago', ru: 'Тринидад и Тобаго' },
  },
  {
    alpha2: 'TN',
    alpha3: 'TUN',
    names: { en: 'Tunisia', ru: 'Тунис' },
  },
  {
    alpha2: 'TR',
    alpha3: 'TUR',
    names: { en: 'Türkiye', ru: 'Турция' },
    aliases: ['Turkey'],
  },
  {
    alpha2: 'TM',
    alpha3: 'TKM',
    names: { en: 'Turkmenistan', ru: 'Туркменистан' },
  },
  {
    alpha2: 'TC',
    alpha3: 'TCA',
    names: { en: 'Turks and Caicos Islands', ru: 'Острова Теркс и Кайкос' },
  },
  {
    alpha2: 'TV',
    alpha3: 'TUV',
    names: { en: 'Tuvalu', ru: 'Тувалу' },
  },
  {
    alpha2: 'UG',
    alpha3: 'UGA',
    names: { en: 'Uganda', ru: 'Уганда' },
  },
  {
    alpha2: 'UA',
    alpha3: 'UKR',
    names: { en: 'Ukraine', ru: 'Украина' },
    aliases: ['Україна'],
  },
  {
    alpha2: 'AE',
    alpha3: 'ARE',
    names: { en: 'United Arab Emirates', ru: 'Объединенные Арабские Эмираты' },
    aliases: ['UAE', 'ОАЭ'],
  },
  {
    alpha2: 'GB',
    alpha3: 'GBR',
    names: {
      en: 'United Kingdom of Great Britain and Northern Ireland',
      ru: 'Соединенное Королевство Великобритании и Северной Ирландии',
    },
    aliases: ['Great Britain', 'UK', 'Соединённое Королевство'],
  },
  {
    alpha2: 'TZ',
    alpha3: 'TZA',
    names: { en: 'United Republic of Tanzania', ru: 'Объединенная Республика Танзания' },
  },
  {
    alpha2: 'UM',
    alpha3: 'UMI',
    names: { en: 'United States Minor Outlying Islands', ru: 'Внешние малые острова Соединенных Штатов' },
  },
  {
    alpha2: 'US',
    alpha3: 'USA',
    names: { en: 'United States of America', ru: 'Соединенные Штаты Америки' },
    aliases: ['United States of America', 'America', 'USA', 'США'],
  },
  {
    alpha2: 'VI',
    alpha3: 'VIR',
    names: { en: 'United States Virgin Islands', ru: 'Виргинские острова Соединенных Штатов' },
  },
  {
    alpha2: 'UY',
    alpha3: 'URY',
    names: { en: 'Uruguay', ru: 'Уругвай' },
  },
  {
    alpha2: 'UZ',
    alpha3: 'UZB',
    names: { en: 'Uzbekistan', ru: 'Узбекистан' },
  },
  {
    alpha2: 'VU',
    alpha3: 'VUT',
    names: { en: 'Vanuatu', ru: 'Вануату' },
  },
  {
    alpha2: 'VE',
    alpha3: 'VEN',
    names: { en: 'Venezuela (Bolivarian Republic of)', ru: 'Венесуэла (Боливарианская Республика)' },
  },
  {
    alpha2: 'VN',
    alpha3: 'VNM',
    names: { en: 'Viet Nam', ru: 'Вьетнам' },
  },
  {
    alpha2: 'WF',
    alpha3: 'WLF',
    names: { en: 'Wallis and Futuna Islands', ru: 'Острова Уоллис и Футуна' },
  },
  {
    alpha2: 'EH',
    alpha3: 'ESH',
    names: { en: 'Western Sahara', ru: 'Западная Сахара' },
  },
  {
    alpha2: 'YE',
    alpha3: 'YEM',
    names: { en: 'Yemen', ru: 'Йемен' },
  },
  {
    alpha2: 'ZM',
    alpha3: 'ZMB',
    names: { en: 'Zambia', ru: 'Замбия' },
  },
  {
    alpha2: 'ZW',
    alpha3: 'ZWE',
    names: { en: 'Zimbabwe', ru: 'Зимбабве' },
  },
] as const;
