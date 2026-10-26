const DEFAULTS = {
  boldStarts:false, letters:3, colourStarts:false, accent:"blue",
  fontSize:"default", lineSpacing:"default", paragraphSpacing:false,
  narrowWidth:false, ruler:false, paragraphFocus:false
};
const ids = Object.keys(DEFAULTS);
const $ = id => document.getElementById(id);
let currentTabId = null;
let settings = {...DEFAULTS};

function readControls() {
  return {
    boldStarts:$("boldStarts").checked,
    letters:Number($("letters").value),
    colourStarts:$("colourStarts").checked,
    accent:$("accent").value,
    fontSize:$("fontSize").value,
    lineSpacing:$("lineSpacing").value,
    paragraphSpacing:$("paragraphSpacing").checked,
    narrowWidth:$("narrowWidth").checked,
    ruler:$("ruler").checked,
    paragraphFocus:$("paragraphFocus").checked
  };
}
function writeControls(s) {
  $("boldStarts").checked=!!s.boldStarts;
  $("letters").value=String(s.letters ?? 3);
  $("colourStarts").checked=!!s.colourStarts;
  $("accent").value=s.accent || "blue";
  $("fontSize").value=s.fontSize || "default";
  $("lineSpacing").value=s.lineSpacing || "default";
  $("paragraphSpacing").checked=!!s.paragraphSpacing;
  $("narrowWidth").checked=!!s.narrowWidth;
  $("ruler").checked=!!s.ruler;
  $("paragraphFocus").checked=!!s.paragraphFocus;
}
function sendSettings() {
  settings = readControls();
  chrome.storage.sync.set(settings);
  if (currentTabId !== null) chrome.tabs.sendMessage(currentTabId,{type:"FOCUSREAD_SETTINGS",settings},()=>{void chrome.runtime.lastError;});
  $("status").textContent="Settings saved for future pages too.";
}
function sendMessage(message, callback) {
  if (currentTabId === null) return;
  chrome.tabs.sendMessage(currentTabId,message,response=>{
    if (chrome.runtime.lastError) {
      $("status").textContent="This page does not allow extensions (try a normal website).";
      return;
    }
    callback && callback(response);
  });
}
document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  currentTabId = tab?.id ?? null;
  chrome.storage.sync.get(DEFAULTS, saved => {
    settings = {...DEFAULTS,...saved};
    writeControls(settings);
  });
  ids.forEach(id => $(id)?.addEventListener("change",sendSettings));
  $("enableAll").addEventListener("click",()=>{
    const s={...readControls(),boldStarts:true,paragraphSpacing:true,ruler:true};
    writeControls(s); sendSettings();
  });
  $("reset").addEventListener("click",()=>{
    writeControls(DEFAULTS); sendSettings();
    $("estimateResult").textContent="";
  });
  $("estimate").addEventListener("click",()=>{
    sendMessage({type:"FOCUSREAD_ESTIMATE"},r=>{
      if(r) $("estimateResult").textContent=`About ${r.minutes} min · ${r.words.toLocaleString()} words (estimate at 200 words/min).`;
    });
  });
  $("readAloud").addEventListener("click",()=>{
    sendMessage({type:"FOCUSREAD_SPEAK"},r=>{
      if(r?.started) $("readAloud").textContent="Stop reading";
      else if(r?.stopped) $("readAloud").textContent="Read aloud";
      else if(r?.error) $("status").textContent=r.error;
    });
  });
});