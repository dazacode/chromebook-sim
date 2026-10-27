// Filter rules modeled on how typical K-12 web filters are configured:
// CIPA-mandated categories are always blocked, everything else depends on
// the grade-band policy profile assigned to the student's OU.

export type Action = "allow" | "restrict" | "flag" | "block";

export type CategoryId =
  | "education"
  | "reference"
  | "productivity"
  | "government"
  | "search"
  | "search_unsafe"
  | "video"
  | "news"
  | "developer"
  | "adult"
  | "gambling"
  | "weapons"
  | "drugs"
  | "violence_hate"
  | "proxy"
  | "hacking"
  | "piracy"
  | "games"
  | "social"
  | "chat"
  | "streaming"
  | "music"
  | "shopping"
  | "dating"
  | "ai_chat"
  | "ai_companion"
  | "sports"
  | "url_shortener"
  | "file_sharing"
  | "web_hosting"
  | "browser_internal"
  | "infrastructure"
  | "entertainment"
  | "health"
  | "sexuality_health"
  | "ads"
  | "dynamic_dns"
  | "newly_registered"
  | "security"
  | "uncategorized";

export type ProfileId = "elementary" | "middle" | "high" | "staff" | "guest";

export interface Category {
  id: CategoryId;
  name: string;
  description: string;
  /** Required to be blocked under the Children's Internet Protection Act. */
  cipa?: boolean;
  /** Blocked for every profile, like CIPA, but for security rather than legal reasons. */
  alwaysBlock?: boolean;
  /** Why schools block this, shown on the block page. */
  blockReason: string;
}

export const CATEGORIES: Record<CategoryId, Category> = {
  education: { id: "education", name: "Education", description: "Learning platforms, LMSs, school districts, universities.", blockReason: "" },
  reference: { id: "reference", name: "Reference", description: "Encyclopedias, dictionaries, maps.", blockReason: "" },
  productivity: { id: "productivity", name: "Productivity", description: "Docs, slides, design and office tools.", blockReason: "" },
  government: { id: "government", name: "Government", description: ".gov and .mil sites.", blockReason: "Government sites are limited on the guest network." },
  search: { id: "search", name: "Search Engines", description: "Web search. Allowed only with SafeSearch enforced.", blockReason: "Search is limited for this profile." },
  search_unsafe: { id: "search_unsafe", name: "Search Engines (No SafeSearch)", description: "Search engines and metasearch instances that can't enforce SafeSearch.", blockReason: "This search engine can't enforce SafeSearch, so it isn't approved for student use." },
  video: { id: "video", name: "Video Sharing", description: "YouTube and similar. Allowed with Restricted Mode for older grades.", blockReason: "Video-sharing sites are not approved for this grade level." },
  news: { id: "news", name: "News & Media", description: "News publishers.", blockReason: "News sites are limited for this grade level." },
  developer: { id: "developer", name: "Developer Tools", description: "Code hosting, Q&A, online IDEs.", blockReason: "Online code sandboxes are commonly used to host games and proxies." },
  adult: { id: "adult", name: "Adult Content", description: "Pornography, nudity, sexually explicit material.", cipa: true, blockReason: "Sexually explicit content is blocked under the Children's Internet Protection Act (CIPA)." },
  gambling: { id: "gambling", name: "Gambling", description: "Casinos, sports betting, sweepstakes.", cipa: true, blockReason: "Gambling is illegal for minors and blocked on all school devices." },
  weapons: { id: "weapons", name: "Weapons", description: "Firearm sales, ammunition, weapon modification.", cipa: true, blockReason: "Weapon sales and modification content is blocked on school devices." },
  drugs: { id: "drugs", name: "Drugs, Alcohol & Tobacco", description: "Vapes, cannabis, alcohol sales.", cipa: true, blockReason: "Content promoting drugs, alcohol, vaping or tobacco is harmful to minors." },
  violence_hate: { id: "violence_hate", name: "Violence & Hate", description: "Gore, extremism, hate speech.", cipa: true, blockReason: "Violent, graphic or hateful content is harmful to minors." },
  proxy: { id: "proxy", name: "Proxies & Anonymizers", description: "Web proxies, VPNs, filter-bypass tools.", blockReason: "Proxies and VPNs bypass the school's content filter, which the district is required by law to keep in place." },
  hacking: { id: "hacking", name: "Hacking", description: "Exploits, cheats, Chromebook unenrollment guides.", blockReason: "Hacking and device-tampering content violates the Acceptable Use Policy." },
  piracy: { id: "piracy", name: "Piracy & Illegal Downloads", description: "Torrents, free movie/anime mirrors, warez.", blockReason: "Copyright-infringing sites are blocked and often distribute malware." },
  games: { id: "games", name: "Games", description: "Online games, \"unblocked games\" sites, game stores.", blockReason: "Gaming sites are blocked during instructional time." },
  social: { id: "social", name: "Social Media", description: "TikTok, Instagram, Snapchat, Reddit, X, Facebook.", blockReason: "Social media is blocked on school devices to protect student privacy and reduce distraction." },
  chat: { id: "chat", name: "Chat & Messaging", description: "Discord, Telegram, anonymous chat.", blockReason: "Unmonitored chat with strangers is a student-safety risk." },
  streaming: { id: "streaming", name: "Streaming Media", description: "Netflix, Twitch, Hulu, Disney+.", blockReason: "Entertainment streaming uses network bandwidth and is not instructional." },
  music: { id: "music", name: "Music Streaming", description: "Spotify, SoundCloud, Pandora.", blockReason: "Music streaming is not approved for this grade level." },
  shopping: { id: "shopping", name: "Shopping", description: "Retail and marketplaces.", blockReason: "Online shopping is not approved for this grade level." },
  dating: { id: "dating", name: "Dating", description: "Dating and hookup services.", cipa: true, blockReason: "Dating services are not appropriate for minors." },
  ai_chat: { id: "ai_chat", name: "AI Chatbots", description: "General-purpose generative AI assistants.", blockReason: "Generative AI tools are not approved for this grade level without teacher supervision." },
  ai_companion: { id: "ai_companion", name: "AI Companions", description: "Roleplay/companion chatbots.", blockReason: "AI companion and roleplay bots are a student-safety risk and are not age-appropriate." },
  sports: { id: "sports", name: "Sports", description: "Sports news and scores.", blockReason: "Sports sites are not approved for this grade level." },
  url_shortener: { id: "url_shortener", name: "URL Shorteners", description: "Links that hide their destination.", blockReason: "Shortened links hide where they go and are used to get around the filter." },
  file_sharing: { id: "file_sharing", name: "File Sharing", description: "Anonymous file hosts.", blockReason: "Anonymous file hosting is a common source of malware and filter-bypass tools." },
  web_hosting: { id: "web_hosting", name: "Free Web Hosting", description: "Shared hosting subdomains (github.io, vercel.app, netlify.app...).", blockReason: "Free hosting subdomains are heavily used for unblocked-game and proxy mirrors." },
  infrastructure: { id: "infrastructure", name: "Infrastructure & CDNs", description: "Fonts, CDNs, cloud APIs and analytics that pages load in the background.", blockReason: "" },
  browser_internal: { id: "browser_internal", name: "Browser Internals", description: "chrome:// pages, extensions, local files.", blockReason: "Browser settings and developer pages are disabled by your administrator." },
  entertainment: { id: "entertainment", name: "Entertainment", description: "Celebrity news, memes, TV/movie fan sites. The most-blocked category in The Markup's 2024 district records.", blockReason: "Entertainment sites are not instructional and are blocked during the school day." },
  health: { id: "health", name: "Health", description: "Medical and public-health information.", blockReason: "Health sites are limited on this network." },
  sexuality_health: { id: "sexuality_health", name: "Sex Education & Sexuality", description: "Sexual and reproductive health, LGBTQ+ resources. Not explicit, but frequently overblocked; schools often mark these \"High School Allowed\".", blockReason: "Sex education and sexuality resources are restricted for this grade level. Ask a counselor or nurse if you need this information." },
  ads: { id: "ads", name: "Ads & Trackers", description: "Ad networks and tracking scripts, blocked at the DNS layer by many districts.", blockReason: "Advertising and tracking domains are blocked on the school network." },
  dynamic_dns: { id: "dynamic_dns", name: "Dynamic DNS", description: "Free dynamic-DNS hostnames (duckdns, no-ip...), common for self-hosted proxies.", blockReason: "Dynamic DNS hostnames are commonly used to run proxies from home connections." },
  newly_registered: { id: "newly_registered", name: "Newly Registered Domains", description: "Domains registered in the last 30 days.", blockReason: "This domain was registered very recently. New domains are blocked until they've been reviewed, since most new phishing and proxy sites are days old." },
  security: { id: "security", name: "Malware & Phishing", description: "Known malware, phishing, scam and badware hosts.", alwaysBlock: true, blockReason: "This site is known to host malware, phishing or scams." },
  uncategorized: { id: "uncategorized", name: "Uncategorized", description: "New or unknown site the filter hasn't classified yet.", blockReason: "This site hasn't been reviewed by the filter yet. New, unreviewed sites are blocked until categorized." },
};

/** Per-profile actions. Anything not listed falls back to `default`. */
export const PROFILES: Record<ProfileId, { name: string; description: string; default: Action; actions: Partial<Record<CategoryId, Action>> }> = {
  elementary: {
    name: "Elementary (K-5)",
    description: "Most restrictive. Uncategorized sites are blocked.",
    default: "block",
    actions: {
      education: "allow", reference: "allow", productivity: "allow", government: "allow", infrastructure: "allow",
      search: "restrict", video: "block", news: "flag", developer: "block", health: "allow",
      music: "block", shopping: "block", sports: "block", ai_chat: "block",
      file_sharing: "block", web_hosting: "block", uncategorized: "block",
    },
  },
  middle: {
    name: "Middle School (6-8)",
    description: "YouTube in Restricted Mode, uncategorized sites flagged.",
    default: "block",
    actions: {
      education: "allow", reference: "allow", productivity: "allow", government: "allow", infrastructure: "allow",
      search: "restrict", video: "restrict", news: "allow", developer: "flag", health: "allow",
      music: "flag", shopping: "block", sports: "allow", ai_chat: "block",
      file_sharing: "block", web_hosting: "flag", uncategorized: "flag",
    },
  },
  high: {
    name: "High School (9-12)",
    description: "Default profile. Most districts' high-school OU.",
    default: "block",
    actions: {
      education: "allow", reference: "allow", productivity: "allow", government: "allow", infrastructure: "allow",
      search: "restrict", video: "restrict", news: "allow", developer: "allow", health: "allow",
      sexuality_health: "allow", entertainment: "flag",
      music: "allow", shopping: "flag", sports: "allow", ai_chat: "flag",
      file_sharing: "flag", web_hosting: "flag", uncategorized: "flag",
    },
  },
  staff: {
    name: "Staff / Teacher",
    description: "Only CIPA, proxy and security categories blocked.",
    default: "allow",
    actions: {
      search: "restrict", proxy: "block", hacking: "block", piracy: "block",
      url_shortener: "flag", ai_companion: "flag", browser_internal: "allow",
      search_unsafe: "flag", dynamic_dns: "flag", newly_registered: "flag",
    },
  },
  guest: {
    name: "Guest Wi-Fi",
    description: "Visitors and unenrolled devices. Strictest: only school tools load.",
    default: "block",
    actions: {
      education: "allow", productivity: "allow", infrastructure: "allow",
      search: "restrict", government: "flag", reference: "flag", news: "flag",
    },
  },
};

export function actionFor(profile: ProfileId, category: CategoryId): Action {
  if (CATEGORIES[category].cipa || CATEGORIES[category].alwaysBlock) return "block";
  const p = PROFILES[profile];
  return p.actions[category] ?? p.default;
}

export const ACTION_RANK: Record<Action, number> = { allow: 0, restrict: 1, flag: 2, block: 3 };

// --- Domain lists ---------------------------------------------------------
// A pattern matches the host itself and any subdomain. `path` narrows a rule
// to a path prefix; the most specific matching rule wins.

export interface DomainRule {
  pattern: string;
  category: CategoryId;
  path?: string;
  note?: string;
}

const list = (category: CategoryId, domains: string, note?: string): DomainRule[] =>
  domains.trim().split(/\s+/).map((pattern) => ({ pattern, category, note }));

export const DOMAIN_RULES: DomainRule[] = [
  ...list("education", `
    classroom.google.com edu.google.com khanacademy.org quizlet.com kahoot.com kahoot.it desmos.com
    ixl.com brainpop.com newsela.com instructure.com canvas.net schoology.com clever.com edpuzzle.com
    nearpod.com code.org scratch.mit.edu duolingo.com commonlit.org readworks.org gimkit.com blooket.com
    quizizz.com wayground.com padlet.com flipgrid.com flip.com seesaw.me classdojo.com prodigygame.com
    mathway.com deltamath.com albert.io collegeboard.org khanacademykids.org typing.com typingclub.com
    pbslearningmedia.org studentnewsdaily.com noredink.com membean.com savvasrealize.com mheducation.com
    pearson.com mcgraw-hill.com zearn.org imaginelearning.com lexiacore5.com renaissance.com freckle.com
    ck12.org brilliant.org codecademy.com coursera.org edx.org openstax.org ted.com phet.colorado.edu
    turnitin.com grammarly.com noodletools.com easybib.com gale.com ebsco.com jstor.org britannica.com
    i-ready.com curriculumassociates.com nwea.org powerschool.com infinitecampus.org skyward.com
    aeries.net studentvue.com quill.org formative.com goformative.com peardeck.com magicschool.ai
  `),
  ...list("reference", `
    wikipedia.org wiktionary.org wikimedia.org merriam-webster.com dictionary.com thesaurus.com
    maps.google.com wolframalpha.com archive.org loc.gov purdue.edu owl.purdue.edu nationalgeographic.com
    smithsonianmag.com si.edu nasa.gov weather.gov weather.com timeanddate.com
  `),
  ...list("productivity", `
    docs.google.com drive.google.com sheets.google.com slides.google.com forms.google.com sites.google.com
    calendar.google.com keep.google.com jamboard.google.com meet.google.com mail.google.com accounts.google.com
    office.com office365.com microsoft365.com onedrive.live.com sharepoint.com canva.com adobe.com
    adobeexpress.com wevideo.com screencastify.com loom.com notion.so trello.com zoom.us
    teams.microsoft.com outlook.office.com
  `),
  ...list("search", `google.com bing.com`, "SafeSearch enforced via DNS/policy"),
  ...list("search_unsafe", `duckduckgo.com yahoo.com yandex.com yandex.ru baidu.com startpage.com search.brave.com ecosia.org`, "Can't reliably enforce SafeSearch"),
  ...list("video", `youtube.com youtu.be m.youtube.com youtube-nocookie.com vimeo.com dailymotion.com`),
  { pattern: "youtube.com", path: "/shorts", category: "social", note: "YouTube Shorts treated as short-form social video" },
  { pattern: "youtubekids.com", category: "education" },
  ...list("news", `
    nytimes.com washingtonpost.com cnn.com foxnews.com bbc.com bbc.co.uk npr.org apnews.com reuters.com
    nbcnews.com abcnews.go.com cbsnews.com usatoday.com theguardian.com wsj.com time.com axios.com
    newsela.com pbs.org
  `),
  ...list("developer", `
    github.com gitlab.com stackoverflow.com stackexchange.com developer.mozilla.org w3schools.com
    replit.com codepen.io codesandbox.io jsfiddle.net glitch.com stackblitz.com npmjs.com python.org
  `),
  ...list("adult", `
    pornhub.com xvideos.com xnxx.com xhamster.com onlyfans.com redtube.com youporn.com chaturbate.com
    stripchat.com spankbang.com brazzers.com fansly.com rule34.xxx e621.net nhentai.net hentaihaven.xxx
  `),
  ...list("gambling", `
    draftkings.com fanduel.com bet365.com stake.com stake.us roobet.com betmgm.com caesars.com
    pokerstars.com chumbacasino.com luckyland.com rollbit.com csgoroll.com gamdom.com prizepicks.com
    underdogfantasy.com polymarket.com kalshi.com
  `),
  ...list("weapons", `gunbroker.com armslist.com budsgunshop.com palmettostatearmory.com ammo.com cheaperthandirt.com`),
  ...list("drugs", `leafly.com weedmaps.com vapewild.com elementvape.com juul.com drizly.com totalwine.com erowid.org`),
  ...list("violence_hate", `bestgore.fun liveleak.com kiwifarms.net 4chan.org 4channel.org stormfront.org`),
  ...list("proxy", `
    nordvpn.com expressvpn.com protonvpn.com proton.me surfshark.com hide.me hidemyass.com croxyproxy.com
    proxysite.com kproxy.com 4everproxy.com blockaway.net proxyium.com croxy.network
    windscribe.com tunnelbear.com psiphon.ca torproject.org ultrasurf.us urban-vpn.com hola.org
    translate.goog holy.how titaniumnetwork.org
  `),
  { pattern: "translate.google.com", path: "/translate", category: "proxy", note: "Google Translate page-proxy mode" },
  ...list("hacking", `exploit-db.com hackforums.net nulled.to cracked.io sh1mmer.me cheatengine.org v3rmillion.net`),
  ...list("piracy", `
    thepiratebay.org 1337x.to rarbg.to yts.mx fmovies.to 123movies.com soap2day.to gogoanime.gg
    9anime.to hianime.to aniwave.to putlocker.vip zoro.to solarmovie.pe flixtor.to fitgirl-repacks.site
    nyaa.si kissanime.ru z-lib.org libgen.is
  `),
  ...list("games", `
    roblox.com rbxcdn.com fortnite.com epicgames.com steampowered.com store.steampowered.com
    minecraft.net poki.com crazygames.com coolmathgames.com miniclip.com friv.com y8.com kongregate.com
    armorgames.com agame.com addictinggames.com krunker.io slither.io agar.io shellshock.io 1v1.lol
    geometrydash.io chess.com lichess.org itch.io newgrounds.com twitchtracker.com gamejolt.com
    nitrotype.com retrobowl.me slope-game.github.io unblockedgames66.com classroom6x.com tyrone.games
    epicgames.dev xbox.com playstation.com nintendo.com ea.com blizzard.com battle.net riotgames.com
    leagueoflegends.com valorant.com moomoo.io diep.io surviv.io zombsroyale.io bloxd.io
    geoguessr.com wordle.global
  `),
  { pattern: "nytimes.com", path: "/games", category: "games", note: "NYT Games (Wordle, Connections)" },
  ...list("social", `
    tiktok.com instagram.com snapchat.com facebook.com fb.com twitter.com x.com reddit.com redd.it
    threads.net bsky.app tumblr.com pinterest.com vsco.co bereal.com lemon8-app.com linkedin.com
    mastodon.social quora.com wattpad.com ask.fm yubo.live
  `),
  ...list("chat", `
    discord.com discord.gg discordapp.com telegram.org t.me web.whatsapp.com whatsapp.com messenger.com
    omegle.com ome.tv chatroulette.com emeraldchat.com kik.com wizz.chat signal.org groupme.com
  `),
  ...list("streaming", `
    netflix.com hulu.com disneyplus.com max.com hbomax.com primevideo.com peacocktv.com paramountplus.com
    twitch.tv kick.com crunchyroll.com funimation.com tubitv.com pluto.tv plex.tv tv.youtube.com
  `),
  ...list("music", `spotify.com open.spotify.com soundcloud.com pandora.com music.apple.com music.youtube.com deezer.com tidal.com`),
  ...list("shopping", `amazon.com ebay.com walmart.com target.com etsy.com shein.com temu.com aliexpress.com bestbuy.com stockx.com`),
  ...list("dating", `tinder.com bumble.com hinge.co grindr.com match.com okcupid.com pof.com`),
  ...list("ai_chat", `
    chatgpt.com chat.openai.com openai.com claude.ai gemini.google.com bard.google.com copilot.microsoft.com
    perplexity.ai poe.com deepseek.com chat.deepseek.com grok.com x.ai meta.ai you.com huggingface.co
    quillbot.com
  `),
  ...list("ai_companion", `character.ai beta.character.ai replika.com chai.ml janitorai.com talkie-ai.com crushon.ai polybuzz.ai`),
  ...list("sports", `espn.com nfl.com nba.com mlb.com nhl.com bleacherreport.com si.com theathletic.com`),
  ...list("url_shortener", `bit.ly tinyurl.com t.co goo.gl ow.ly is.gd cutt.ly rebrand.ly shorturl.at rb.gy tiny.cc`),
  ...list("file_sharing", `mega.nz mega.io mediafire.com wetransfer.com dropbox.com sendspace.com gofile.io anonfiles.com pixeldrain.com catbox.moe`),
  ...list("infrastructure", `
    googleapis.com gstatic.com googleusercontent.com ytimg.com ggpht.com googletagmanager.com
    recaptcha.net jsdelivr.net unpkg.com cdnjs.cloudflare.com
    cloudflare.com cloudflareinsights.com akamaized.net akamaihd.net fastly.net cloudfront.net
    amazonaws.com azureedge.net azurewebsites.net windows.net gravatar.com w3.org schema.org
    example.com example.org example.net fontawesome.com typekit.net sentry.io stripe.com
    vercel.com netlify.com supabase.co firebaseio.com apple.com microsoft.com live.com
  `),
  { pattern: "chromewebstore.google.com", category: "browser_internal", note: "Extension installs restricted to admin force-installed list" },
  { pattern: "chrome.google.com", path: "/webstore", category: "browser_internal", note: "Extension installs restricted to admin force-installed list" },
  ...list("ads", `
    doubleclick.net googlesyndication.com googleadservices.com google-analytics.com googletagmanager.com
    adnxs.com taboola.com outbrain.com criteo.com amazon-adsystem.com scorecardresearch.com hotjar.com
    adsrvr.org pubmatic.com rubiconproject.com moatads.com quantserve.com
  `),
  ...list("entertainment", `
    buzzfeed.com tmz.com people.com eonline.com imdb.com 9gag.com knowyourmeme.com ifunny.co
    imgur.com giphy.com fandom.com rottentomatoes.com usmagazine.com perezhilton.com
  `),
  ...list("health", `
    cdc.gov nih.gov medlineplus.gov mayoclinic.org webmd.com clevelandclinic.org healthline.com
    kidshealth.org who.int 988lifeline.org samhsa.gov
  `),
  ...list("sexuality_health", `
    plannedparenthood.org scarleteen.com sexetc.org bedsider.org thetrevorproject.org glaad.org
    itgetsbetter.org pflag.org advocatesforyouth.org loveisrespect.org gender-spectrum.org
  `, "Frequently overblocked: found blocked in 8 of 16 districts' records (The Markup, 2024)"),
  ...list("dynamic_dns", `
    duckdns.org no-ip.com ddns.net hopto.org zapto.org sytes.net myftp.org serveo.net afraid.org
    mooo.com dynu.net dynv6.net freeddns.org duckdns.net
  `),
  ...list("proxy", `
    cloudflare-dns.com dns.google dns.quad9.net doh.opendns.com dns.nextdns.io doh.mullvad.net dns.adguard-dns.com
  `, "DNS-over-HTTPS resolver: bypasses the school's DNS filter"),
  ...list("web_hosting", `
    github.io vercel.app netlify.app pages.dev workers.dev glitch.me replit.app replit.dev repl.co
    onrender.com herokuapp.com fly.dev railway.app surge.sh web.app firebaseapp.com weebly.com
    wixsite.com neocities.org 000webhostapp.com infinityfreeapp.com ngrok.io ngrok-free.app
    trycloudflare.com stackblitz.io deno.dev blogspot.com wordpress.com carrd.co
  `),
];

/** School and government TLDs. Categorized as Education/Government, but still filtered. */
export const EDU_GOV_TLDS = [/\.edu$/, /\.gov$/, /\.mil$/, /\.k12\.[a-z]{2}\.us$/, /\.gov\.[a-z]{2}$/, /\.edu\.[a-z]{2}$/, /\.ac\.uk$/, /\.sch\.uk$/];

// --- Keywords -------------------------------------------------------------
// `tokens` match whole words split on non-alphanumerics (so "sussex" doesn't
// trip "sex"). `substrings` catch run-together hostnames like
// "unblockedgames76". Weights feed the content classifier.

export interface KeywordSet {
  category: CategoryId;
  tokens: string[];
  substrings: string[];
  weight: number;
}

export const KEYWORDS: KeywordSet[] = [
  { category: "adult", weight: 5, tokens: ["porn", "porno", "xxx", "nsfw", "hentai", "nude", "nudes", "naked", "milf", "camgirl", "camgirls", "onlyfans", "sex", "sexy", "erotic", "fetish", "boobs", "stripper", "escort", "escorts", "rule34"], substrings: ["porn", "xxx", "hentai", "onlyfans", "camgirl", "rule34"] },
  { category: "proxy", weight: 6, tokens: ["proxy", "proxies", "vpn", "unblock", "unblocker", "bypass", "anonymizer", "anonymous browsing", "webproxy", "ultraviolet", "rammerhead", "scramjet", "womginx", "corrosion", "interstellar", "doge unblocker", "holy unblocker", "unblock websites"], substrings: ["proxy", "unblocker", "vpn", "bypass", "rammerhead", "ultraviolet", "scramjet"] },
  { category: "games", weight: 3, tokens: ["unblocked", "games", "game", "arcade", "minecraft", "fortnite", "roblox", "slope game", "retro bowl", "subway surfers", "cookie clicker", "geometry dash", "1v1", "fnaf", "shooter", "io games", "flash games", "ragdoll", "drift hunters", "moto x3m", "run 3", "eaglercraft", "emulator", "roms"], substrings: ["unblocked", "games", "eaglercraft", "1v1lol", "retrobowl"] },
  { category: "gambling", weight: 5, tokens: ["casino", "slots", "poker", "blackjack", "roulette", "betting", "sportsbook", "parlay", "jackpot", "wager", "sweepstakes", "crash gambling", "case opening", "skin betting"], substrings: ["casino", "sportsbook", "slots", "betting"] },
  { category: "drugs", weight: 4, tokens: ["vape", "vapes", "vaping", "juul", "weed", "cannabis", "thc", "cbd", "delta8", "edibles", "dispensary", "nicotine", "kratom", "shrooms", "lsd"], substrings: ["vape", "cannabis", "dispensary"] },
  { category: "weapons", weight: 4, tokens: ["firearms", "ammo", "ammunition", "ar15", "rifles", "handgun", "handguns", "glock", "suppressor", "ghost gun", "switchblade"], substrings: ["ammo", "firearm", "gunshop"] },
  { category: "violence_hate", weight: 4, tokens: ["gore", "beheading", "massacre", "white power", "nazi", "neo nazi", "kys"], substrings: ["gore"] },
  { category: "hacking", weight: 4, tokens: ["hack", "hacks", "hacking", "exploit", "exploits", "cheats", "aimbot", "unenroll", "unenrollment", "sh1mmer", "ltbeef", "keylogger", "ddos", "crack", "cracked", "jailbreak", "bookmarklet"], substrings: ["unenroll", "sh1mmer", "aimbot", "keylogger"] },
  { category: "piracy", weight: 4, tokens: ["torrent", "torrents", "free movies", "watch free", "123movies", "putlocker", "warez", "crack download", "free anime", "watch anime", "repack"], substrings: ["torrent", "123movies", "putlocker", "warez"] },
  { category: "dating", weight: 4, tokens: ["dating", "hookup", "singles", "date tonight"], substrings: ["dating", "hookup"] },
  { category: "chat", weight: 2, tokens: ["chat with strangers", "random chat", "anonymous chat", "chatroom", "chat room", "talk to strangers"], substrings: ["chatroulette", "strangerchat"] },
  { category: "ai_companion", weight: 3, tokens: ["ai girlfriend", "ai boyfriend", "roleplay bot", "ai companion", "character chat"], substrings: [] },
];

/** Code-level signatures filters look for when they scan page content. */
export const CONTENT_SIGNATURES: { category: CategoryId; pattern: RegExp; label: string; weight: number }[] = [
  { category: "proxy", pattern: /uv\.(bundle|config|sw|handler)\.js|__uv\$config|\$uv\b/i, label: "Ultraviolet proxy service worker", weight: 20 },
  { category: "proxy", pattern: /scramjet\.(worker|bundle|codecs|config)|__scramjet/i, label: "Scramjet proxy", weight: 20 },
  { category: "proxy", pattern: /rammerhead|rhfs-|\/rammerhead\.js/i, label: "Rammerhead proxy", weight: 20 },
  { category: "proxy", pattern: /bare-?(server|mux|client)|epoxy-transport|libcurl-transport|wisp(js|-server)?\b/i, label: "Bare/Wisp proxy transport", weight: 15 },
  { category: "proxy", pattern: /about:blank cloak|tab cloak|cloak(ing)? (the )?tab|panic key/i, label: "Tab-cloaking / panic-key feature (hides activity from teachers)", weight: 15 },
  { category: "games", pattern: /UnityLoader\.js|createUnityInstance|\.unityweb\b|Build\/[^"']+\.loader\.js/i, label: "Unity WebGL game build", weight: 8 },
  { category: "games", pattern: /ruffle(\.js)?|\.swf["'?]/i, label: "Flash emulator (Ruffle) / SWF game", weight: 10 },
  { category: "games", pattern: /EmulatorJS|EJS_player|EJS_core|\.(gba|nes|sfc|smc|n64)["']/i, label: "Retro console emulator / ROMs", weight: 12 },
  { category: "games", pattern: /eaglercraft|eagler/i, label: "Eaglercraft (browser Minecraft)", weight: 15 },
  { category: "games", pattern: /\b(phaser|pixi|construct ?3|c3runtime|godot|gdevelop)\b/i, label: "HTML5 game engine", weight: 3 },
  { category: "games", pattern: /unblocked games?/i, label: "\"Unblocked games\" text", weight: 12 },
  { category: "hacking", pattern: /javascript:\s*\(?function|bookmarklet/i, label: "Bookmarklet code", weight: 5 },
  { category: "chat", pattern: /socket\.io|new WebSocket\(/i, label: "Real-time chat socket", weight: 1 },
];

/** Search query parameters that filters inspect for blocked terms. */
export const SEARCH_QUERY_PARAMS = ["q", "query", "p", "search_query", "text", "wd"];
