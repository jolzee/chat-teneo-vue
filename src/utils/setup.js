import { Ripple } from "vuetify/lib/directives";
import replaceString from "replace-string";
const superagent = require("superagent");
import PromisedLocation from "promised-location";

import { COLOR_NAMES } from "../constants/color-names.js";
import Vue from "vue";
import Vuetify from "vuetify/lib";

import { ASR_CORRECTIONS } from "../constants/asr-corrections"; // fix ASR issues before they get to Teneo
import { LiveChat } from "./live-chat";
import { STORAGE_KEY } from "../constants/solution-config-default";

let logrocketPlugin = null;

// start LogRocket Setup
if (window.leopardConfig.isProduction && window.leopardConfig.logging.logRocket) {
  import(/* webpackChunkName: "logrocket" */ "logrocket")
    .then(({ default: LogRocket }) => {
      Vue.$log.debug(`Setting up LogRocket 🚀`);
      LogRocket.init(window.leopardConfig.logging.logRocket);
      import(/* webpackChunkName: "logrocket" */ "logrocket-vuex").then(({ default: createPlugin }) => {
        logrocketPlugin = createPlugin(LogRocket);
        Vue.$log.debug(`LogRocket 🚀 setup complete`);
      });
    })
    .catch(err => {
      Vue.$log.error(`Failed to dynamically import LogRocket 🚀`, err);
    });
}
// End LogRocket Setup

// start sentry

if (window.window.leopardConfig.isProduction && window.window.leopardConfig.logging.sentryDsn) {
  Promise.all([
    import(/* webpackChunkName: "sentry" */ "@sentry/browser"),
    import(/* webpackChunkName: "sentry" */ "@sentry/integrations")
  ]).then(([Sentry, Integrations]) => {
    Sentry.init({
      dsn: window.leopardConfig.logging.sentryDsn,
      integrations: [new Integrations.Vue({ Vue, attachProps: true })],
      logErrors: true
    });
  });
}
// end sentry

export default class Setup {
  constructor() {
    this.TENEO_CHAT_HISTORY = "teneo-chat-history";
    this.TENEO_LAST_INTERACTION_DATE = "teneo-last-interaction";
    this.TENEO_CHAT_DARK_THEME = "darkTheme";
    this.logrocketPlugin = logrocketPlugin;
    this.ASR_CORRECTIONS_MERGED;
    this.liveChat;
    this.CHAT_TITLE = "Configure Me";
    this.IS_AGENT_ASSIST = this.doesParameterExist("plugin_id");
    this.EMBED = this.doesParameterExist("embed") || this.doesParameterExist("button");
    this.SHOW_BUTTON_ONLY = this.doesParameterExist("button");
    this.ENABLE_LIVE_CHAT = false;
    this.FLOAT = false;
    this.THEME = {
      primary: "#3277D5",
      secondary: "#E78600",
      accent: "#4CAF50",
      error: "#FF5252",
      info: "#2196F3",
      success: "#4CAF50",
      warning: "#FFC107"
    };
    this.IFRAME_URL = "";
    this.KNOWLEDGE_DATA = [];
    this.LOCALE = "en";
    this.REQUEST_PARAMETERS = "";
    this.RESPONSE_ICON = "";
    this.SEND_CTX_PARAMS = "login";
    this.TENEO_URL = "";
    this.USE_SESSION_STORAGE = !this.EMBED;
    this.USER_ICON = "";
    this.activeSolution = null;
    this.chatConfig = null;
    // Get the dark theme setting from local storage
    // let darkThemeSetting = localStorage.getItem(STORAGE_KEY + "darkTheme");

    localStorage.setItem(STORAGE_KEY + "darkTheme", "false");
  }

  init() {
    return new Promise((resolve, reject) => {
      this.getSolutionConfig()
        .then(() => {
          this.addressBooleans();
          if (!this.EMBED && !this.SHOW_BUTTON_ONLY) {
            this.addIframeHtml();
          }

          Vue.$log.debug(`Active Solution Config: `, this.chatConfig);

          if (this.chatConfig && this.chatConfig.activeSolution) {
            Vue.$log.debug(`Active Solution: ${this.chatConfig.activeSolution}`);
            let deepLink = this.getParameterByName("dl"); // look for deep link
            if (!deepLink) {
              Vue.$log.debug(`setup.js > No deep link found in the current url`);
              this.activeSolution = this.chatConfig.activeSolution;
              const matchingSolutions = this.chatConfig.solutions.filter(
                solution => solution.name === this.activeSolution
              );
              if (matchingSolutions.length > 0) {
                this.activeSolution = matchingSolutions[0];
              } else {
                this.activeSolution = this.chatConfig.solutions[0];
              }
            } else {
              // allow for deep linking to a specific solution ?dl=<deepLink>
              const matchingSolutions = this.chatConfig.solutions.filter(solution => solution.deepLink === deepLink);
              if (matchingSolutions.length > 0) {
                this.activeSolution = matchingSolutions[0];
              } else {
                // fall back to default
                this.activeSolution = this.chatConfig.activeSolution;
                const matchingSolutions = this.chatConfig.solutions.filter(
                  solution => solution.name === this.activeSolution
                );
                if (matchingSolutions.length > 0) {
                  this.activeSolution = matchingSolutions[0];
                } else {
                  this.activeSolution = this.chatConfig.solutions[0];
                }
              }
            }
            this.ASR_CORRECTIONS_MERGED = this.getMergedAsrCorrections(ASR_CORRECTIONS);
            this.CHAT_TITLE = this.activeSolution.chatTitle;
            this.IFRAME_URL = this.activeSolution.iframeUrl;
            this.KNOWLEDGE_DATA = this.activeSolution.knowledgeData;
            this.LOCALE = this.activeSolution.locale;
            this.FLOAT = this.activeSolution.float;
            this.RESPONSE_ICON = this.activeSolution.responseIcon;
            // this.DIALOG = this.retrievePastDialog();
            this.SEND_CTX_PARAMS = this.activeSolution.sendContextParams
              ? this.activeSolution.sendContextParams
              : "login";
            this.TENEO_URL = this.activeSolution.url + "?viewname=STANDARDJSONP";
            this.USER_ICON = this.activeSolution.userIcon;

            let theme = this.activeSolution.theme;
            // convert color names to their #hex equivalent
            for (const key in theme) {
              if (theme[key].charAt(0) !== "#") theme[key] = COLOR_NAMES[theme[key]];
            }
            this.THEME = theme;

            this.ENABLE_LIVE_CHAT = this.activeSolution.enableLiveChat && !this.doesParameterExist("plugin_id");
            this.UNIQUE_KEY =
              this.activeSolution.deepLink + (window.location.href.indexOf("mobile=true") > -1 ? "_mobile" : "");
            document.title = this.activeSolution.name;

            let self = this;
            // find active CTX parameters and build the parameters part of the URL
            this.activeSolution.contextParams.forEach(contextParam => {
              if (contextParam) {
                contextParam.values.forEach(value => {
                  if (value.active) {
                    self.REQUEST_PARAMETERS =
                      self.REQUEST_PARAMETERS + "&" + contextParam.name + "=" + encodeURIComponent(value.text);
                  }
                });
              }
            });
          }

          // update the IFRAME URL
          if (!this.EMBED && !this.SHOW_BUTTON_ONLY && document.getElementById("site-frame")) {
            document.getElementById("site-frame").src = this.IFRAME_URL;
          }

          Vue.use(Vuetify, {
            directives: {
              Ripple
            }
          });

          let vuetify = new Vuetify({
            breakpoint: {
              thresholds: {
                xs: 0,
                sm: 300,
                md: 480,
                lg: 1000,
                xl: 1300
              }
            },
            theme: {
              dark: false,
              themes: {
                light: this.THEME,
                dark: {
                  primary: "#161616",
                  secondary: "#575757",
                  accent: "#00FF00",
                  error: "#FF4B4B",
                  info: "#1E92D0",
                  success: "#46A352",
                  warning: "#9B5D09"
                }
              }
            },
            directives: {
              Ripple
            }
          });
          resolve(vuetify);
        })
        .catch(message => reject(message));
    });
  }

  addressBooleans() {
    let origChatConfig = JSON.stringify(this.chatConfig);
    origChatConfig = replaceString(origChatConfig, '"true"', "true");
    origChatConfig = replaceString(origChatConfig, '"false"', "false");
    this.chatConfig = JSON.parse(origChatConfig);
  }

  getSolutionConfig() {
    Vue.$log.debug("setup.js: getSolutionConfig ");
    return new Promise((resolve, reject) => {
      // Reload config for each load. Maybe there a new deployment change that you want to
      if (window.leopardConfig.loadFreshConfigForNewSessions) {
        // localStorage.removeItem(STORAGE_KEY + "config");
        Vue.$log.debug("getSolutionConfig > Using internal build config");
      } else {
        Vue.$log.debug("getSolutionConfig > Looking in localstorage first");
        this.chatConfig = JSON.parse(localStorage.getItem(STORAGE_KEY + "config"));
      }

      if (!this.chatConfig || (this.chatConfig && this.chatConfig.solutions.length === 0)) {
        Vue.$log.debug("setup.js > No config found in local storage: Looking for solution config...");
        this._loadDefaultConfig()
          .then(defaultConfig => {
            this.chatConfig = defaultConfig;
            resolve(this.chatConfig);
          })
          .catch(message => reject(message));
      } else {
        Vue.$log.debug("setup.js > Found and using existing solutions in local storage");
        resolve(this.chatConfig);
      }
    });
  }

  _loadDefaultConfig() {
    return new Promise((resolve, reject) => {
      if (!window.leopardConfig.mustGetStaticDefaultConfig) {
        Vue.$log.debug(
          "setup.js > Found and loaded build's solution environment config",
          window.leopardConfig.solutionConfig.buildConfig
        );
        resolve(window.leopardConfig.solutionConfig.buildConfig);
      } else {
        // look for default config on the server
        const defaultConfigUrl = `${location.protocol}//${location.host}${location.pathname}/../static/default.json`;
        superagent
          .get(defaultConfigUrl)
          .accept("application/json")
          .then(res => {
            Vue.$log.debug("setup.js > Found and loaded solution config from /static/default.json");
            let defaultConfig = res.body;
            localStorage.setItem(STORAGE_KEY + "config", JSON.stringify(defaultConfig));
            resolve(defaultConfig);
          })
          .catch(function(error) {
            reject("setup.js > Could not load default.json from /static/default.json: " + error.message);
          });
      }
    });
  }

  setupLiveChat(store) {
    this.liveChat = new LiveChat(store, !this.USE_SESSION_STORAGE, STORAGE_KEY, this.TENEO_CHAT_HISTORY);
  }

  getMergedAsrCorrections(leopardDefaultCorrections) {
    let finalCorrections = leopardDefaultCorrections;
    if (this.activeSolution && "asrCorrections" in this.activeSolution) {
      let solutionResplacements = [];
      let lines = this.activeSolution.asrCorrections.split(/\r?\n/);
      lines.forEach(replacement => {
        if (replacement.trim() !== "") {
          let thisThatArray = replacement.split(/\|/);
          if (thisThatArray.length === 2) {
            thisThatArray[0] = thisThatArray[0].trim();
            thisThatArray[1] = thisThatArray[1].trim();
            solutionResplacements.push(thisThatArray);
          }
        }
      });
      finalCorrections = leopardDefaultCorrections.concat(solutionResplacements);
    }
    return finalCorrections;
  }

  getUrlVars() {
    var vars = {};
    window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m, key, value) {
      vars[key] = value;
    });
    return vars;
  }

  getUrlParam(parameter, defaultvalue) {
    let urlparameter = "";
    if (window.location.href.indexOf(parameter) > -1) {
      urlparameter = this.getUrlVars()[parameter];
      if (urlparameter) {
        urlparameter = urlparameter.split("#")[0];
        urlparameter = urlparameter === "true" ? true : urlparameter === "false" ? false : urlparameter;
      } else {
        urlparameter = defaultvalue;
      }
    } else {
      urlparameter = defaultvalue;
    }
    return urlparameter;
  }

  getLocator() {
    const LOCATION_OPTIONS = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    };
    let locator = new PromisedLocation(LOCATION_OPTIONS);
    return locator;
  }

  isPusherEnabled() {
    return false;
  }

  addIframeHtml() {
    let iframeHtml = this.getFunctionHTMLTemplate(function() {
      /*!
      <iframe id="site-frame" sandbox="allow-same-origin allow-scripts allow-popups allow-forms" src="" frameborder="0" title="Demonstration Page"></iframe>
      */
    });
    document.body.innerHTML += iframeHtml;
  }

  getFunctionHTMLTemplate(f) {
    return f
      .toString()
      .replace(/^[^/]+\/\*!?/, "")
      .replace(/\*\/[^/]+$/, "");
  }

  doesParameterExist(name) {
    var queryString = location.search;
    var params = queryString.substring(1).split("&");
    for (var i = 0; i < params.length; i++) {
      var pair = params[i].split("=");
      if (decodeURIComponent(pair[0]) == name) return true;
    }
    return false;
  }

  getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
      results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return "";
    return decodeURIComponent(results[2].replace(/\+/g, " "));
  }

  setupPusher() {
    // if (this.isPusherEnabled()) {
    //   Vue.use(require("vue-pusher"), {
    //     api_key: window.leopardConfig.pusherKey,
    //     options: {
    //       cluster: "us2",
    //       encrypted: true,
    //       forceTLS: true
    //     }
    //   });
    // }
  }
}
