const logger = require("@/utils/logging").getLogger("postMessage.js");
import { STORAGE_KEY } from "@/constants/solution-config-default";

const trustedDomains = window.leopardConfig.embed.leopardTrustedDomains;

export default class PostMessage {
  constructor(store, config) {
    this.store = store;
    this.config = config;
    if (config.EMBED) {
      logger.info("Listening for messages from parent");
      let that = this;
      window.addEventListener(
        "message",
        function (event) {
          that.receiveMessageFromParent(event);
        },
        false
      );
    }
  }

  sendMessageToParent(message) {
    if (
      !parent ||
      (parent && trustedDomains.length > 0 && !trustedDomains.includes(parent.location.origin))
    ) {
      return;
    }
    logger.debug(`store: sendMessageToParent: ${message}`);
    parent.postMessage(message, "*"); // post multiple times to each domain you want leopard on. Specify origin for each post.
    logger.debug("Message from Leopard >> Embed : " + message);
  }

  receiveMessageFromParent(event) {
    try {
      if (trustedDomains.length > 0 && !trustedDomains.includes(event.origin)) {
        return;
      }

      // otherwise Leopard has been build with no official trusted domains = no restriction

      if (event.data) {
        let messageObject = JSON.parse(event.data);
        if ("info" in messageObject && "id" in messageObject) {
          return true;
        }

        logger.debug("Received a message from parent...");
        logger.debug(messageObject);
        // event.source.postMessage("This is a message sent back from Leopard to the site embedding Leopard", event.origin);

        if ("leopardState" in messageObject && messageObject.leopardState === "closed") {
          this.store.commit("HIDE_CHAT_WINDOW_DISPLAY_EMBED");
          setTimeout(
            function () {
              if (this.config.EMBED && window.leopardConfig.embed.killSessionOnCloseEmbed) {
                // should kill the session and clear dialog history
                logger.info("Killing Teneo Session");
                this.store.dispatch("endTeneoSession");
                localStorage.removeItem(STORAGE_KEY + this.config.TENEO_LAST_INTERACTION_DATE);
                localStorage.removeItem(STORAGE_KEY + this.config.TENEO_CHAT_HISTORY);
                sessionStorage.removeItem(STORAGE_KEY + "teneo-chat-history");
              }
              this.store.commit("SHOW_CHAT_BUTTON"); // only show the open chat button once the session has ended
              return;
            }.bind(this),
            1000
          );
        }
        if ("height" in messageObject && "width" in messageObject) {
          logger.info(`Event from parent`, event);
          this.store.state.ui.parent = {
            height: messageObject.height,
            width: messageObject.width
          };
          logger.debug(
            `receiveMessageFromParent: height: ${messageObject.height} width: ${messageObject.width}`
          );
        } else {
          this.store.state.connection.ctxParameters = messageObject;
        }
      }
    } catch (error) {
      return true;
    }
  }
}
