/* Load before app scripts. Keep this file compatible with older TV browsers. */
(function () {
  if (window.AbortSignal && !AbortSignal.timeout && window.AbortController) {
    AbortSignal.timeout = function (ms) {
      var controller = new AbortController();
      setTimeout(function () { controller.abort(); }, ms);
      return controller.signal;
    };
  }
  if (!Element.prototype.replaceChildren) {
    Element.prototype.replaceChildren = function () {
      while (this.firstChild) this.removeChild(this.firstChild);
      for (var i = 0; i < arguments.length; i++) this.appendChild(typeof arguments[i] === 'string' ? document.createTextNode(arguments[i]) : arguments[i]);
    };
  }
  if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function (search, replacement) {
      return search instanceof RegExp ? this.replace(search, replacement) : this.split(search).join(replacement);
    };
  }
  function checkStartup() {
    var root = document.getElementById('root');
    if (!root || root.children.length) return;
    var box = document.createElement('div');
    box.style.cssText = 'padding:32px;font:18px/1.6 sans-serif;color:#172019;background:white';
    var title = document.createElement('h1');title.textContent = '화면을 불러오지 못했어요';
    var help = document.createElement('p');help.textContent = '브라우저 호환성 또는 파일 로딩 문제입니다. TV 소프트웨어를 업데이트한 뒤 브라우저를 종료하고 다시 접속해 주세요.';
    var info = document.createElement('p');info.textContent = '문제가 계속되면 아래 브라우저 정보와 화면 사진을 보내주세요.';
    var detail = document.createElement('small');detail.textContent = navigator.userAgent;
    box.appendChild(title);box.appendChild(help);box.appendChild(info);box.appendChild(detail);root.appendChild(box);
  }
  window.addEventListener('load', function () { setTimeout(checkStartup, 10000); });
}());
