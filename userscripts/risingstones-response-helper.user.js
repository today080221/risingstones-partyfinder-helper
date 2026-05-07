// ==UserScript==
// @name         石之家副本招募手动响应助手
// @namespace    local.risingstones.partyfinder.helper
// @version      0.1.0
// @description  在石之家官方副本招募详情页，用当前登录态手动响应招募。不会自动提交，不保存联系信息。
// @match        https://ff14risingstones.web.sdo.com/pc/index.html*
// @match        https://ff14risingstones.web.sdo.com/mob/index.html*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const API_URL = "https://apiff14risingstones.web.sdo.com/api/home/recruit/responseRecruitFb";
  const BUTTON_ID = "risingstones-response-helper-button";

  function getRecruitId() {
    const hash = window.location.hash || "";
    const queryIndex = hash.indexOf("?");
    const query = queryIndex >= 0 ? hash.slice(queryIndex + 1) : window.location.search.slice(1);
    return new URLSearchParams(query).get("id") || "";
  }

  function isPartyRecruitPage() {
    return (window.location.hash || "").includes("/recruit/party");
  }

  function ensureButton() {
    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement("button");
      button.id = BUTTON_ID;
      button.type = "button";
      button.addEventListener("click", submitResponse);
      document.body.appendChild(button);
      injectStyle();
    }
    updateButton(button);
  }

  function updateButton(button) {
    const id = getRecruitId();
    button.textContent = id ? `响应招募 #${id}` : "打开招募详情后响应";
    button.disabled = !id || !isPartyRecruitPage();
    button.style.display = isPartyRecruitPage() ? "block" : "none";
  }

  async function submitResponse() {
    const id = getRecruitId();
    if (!id) {
      window.alert("当前页面没有招募 ID，请先打开某条副本招募详情。");
      return;
    }

    const contactInfo = window.prompt("请输入要提交给招募者的联系信息：");
    if (contactInfo === null) {
      return;
    }
    const normalized = contactInfo.trim();
    if (!normalized) {
      window.alert("联系信息不能为空。");
      return;
    }
    if (!window.confirm(`确认响应招募 #${id}？提交后将使用你当前石之家登录态。`)) {
      return;
    }

    try {
      const body = new URLSearchParams({
        id,
        contact_info: normalized
      });
      const response = await window.fetch(API_URL, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json, text/plain, */*"
        },
        body
      });
      const json = await response.json();
      if (json.code === 10000 || json.Code === 0) {
        const shownInfo = json.data && json.data.recruit_contact_info ? `\n招募者联系方式：${json.data.recruit_contact_info}` : "";
        window.alert(`响应成功。${shownInfo}`);
        return;
      }
      window.alert(`响应失败：${json.msg || `HTTP ${response.status}`}`);
    } catch (error) {
      window.alert(`响应失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function injectStyle() {
    const style = document.createElement("style");
    style.textContent = `
      #${BUTTON_ID} {
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 99999;
        min-width: 148px;
        height: 40px;
        border: 1px solid #1e6d5a;
        border-radius: 6px;
        background: #1e6d5a;
        color: #fff;
        font-size: 14px;
        font-weight: 700;
        box-shadow: 0 8px 24px rgba(12, 35, 29, 0.2);
        cursor: pointer;
      }
      #${BUTTON_ID}:disabled {
        cursor: not-allowed;
        opacity: 0.55;
        background: #60756f;
        border-color: #60756f;
      }
    `;
    document.head.appendChild(style);
  }

  ensureButton();
  window.addEventListener("hashchange", ensureButton);
  window.setInterval(ensureButton, 800);
})();
