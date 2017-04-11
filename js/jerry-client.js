var JERRY_DEBUGGER_CONFIGURATION = 1;
var JERRY_DEBUGGER_PARSE_ERROR = 2;
var JERRY_DEBUGGER_BYTE_CODE_CP = 3;
var JERRY_DEBUGGER_PARSE_FUNCTION = 4;
var JERRY_DEBUGGER_BREAKPOINT_LIST = 5;
var JERRY_DEBUGGER_BREAKPOINT_OFFSET_LIST = 6;
var JERRY_DEBUGGER_SOURCE_CODE = 7;
var JERRY_DEBUGGER_SOURCE_CODE_END = 8;
var JERRY_DEBUGGER_SOURCE_CODE_NAME = 9;
var JERRY_DEBUGGER_SOURCE_CODE_NAME_END = 10;
var JERRY_DEBUGGER_FUNCTION_NAME = 11;
var JERRY_DEBUGGER_FUNCTION_NAME_END = 12;
var JERRY_DEBUGGER_RELEASE_BYTE_CODE_CP = 13;
var JERRY_DEBUGGER_BREAKPOINT_HIT = 14;
var JERRY_DEBUGGER_EXCEPTION_HIT = 15;
var JERRY_DEBUGGER_BACKTRACE = 16;
var JERRY_DEBUGGER_BACKTRACE_END = 17;
var JERRY_DEBUGGER_EVAL_RESULT = 18;
var JERRY_DEBUGGER_EVAL_RESULT_END = 19;
var JERRY_DEBUGGER_EVAL_ERROR = 20;
var JERRY_DEBUGGER_EVAL_ERROR_END = 21;

var JERRY_DEBUGGER_FREE_BYTE_CODE_CP = 1;
var JERRY_DEBUGGER_UPDATE_BREAKPOINT = 2;
var JERRY_DEBUGGER_EXCEPTION_CONFIG = 3;
var JERRY_DEBUGGER_STOP = 4;
var JERRY_DEBUGGER_CONTINUE = 5;
var JERRY_DEBUGGER_STEP = 6;
var JERRY_DEBUGGER_NEXT = 7;
var JERRY_DEBUGGER_GET_BACKTRACE = 8;
var JERRY_DEBUGGER_EVAL = 9;
var JERRY_DEBUGGER_EVAL_PART = 10;

var client = {
  socket : null,
  debuggerObj : null,
};

var env = {
  editor : ace.edit("editor"),
  EditSession : null,
  evalResult : null,
  breakpointIds : [],
  lastBreakpoint : null,
  numberOfHiddenPanel : 0,
  isBacktracePanelActive : true,
  isContActive : true,
  evalInput : $("#eval-input"),
  clBacktrace : false,
};

var button = {
  continue : 0,
  stop : 1,
};

var filetab = {
  isWelcome : true,
  welcome : 0,
  work : 1,
};

var session = {
  nextID : 0,
  activeID : 0,
  data : [],
};

var marker = {
  executed : null,
  lastMarked : null,
};

var keybindings = {
  ace : null,
  vim : "ace/keyboard/vim",
  emacs : "ace/keyboard/emacs",
  custom : null, // Create own bindings here.
};

/*
██       ██████   ██████   ██████  ███████ ██████
██      ██    ██ ██       ██       ██      ██   ██
██      ██    ██ ██   ███ ██   ███ █████   ██████
██      ██    ██ ██    ██ ██    ██ ██      ██   ██
███████  ██████   ██████   ██████  ███████ ██   ██
*/

var Logger = function(panelId)
{
  var panel = $("#" + panelId);
  function log(str)
  {
    panel.append($("<span class='log data'>" + str + "</span>"));
    scrollDownToBottom(panel);
  }

  function err(str)
  {
    panel.append($("<span class='error data'>" + str + "</span>"));
    scrollDownToBottom(panel);
  }

  function warn(str)
  {
    panel.append($("<span class='warning data'>" + str + "</span>"));
    scrollDownToBottom(panel);
  }

  this.log = log;
  this.err = err;
  this.warn = warn;
};

var logger = new Logger("console-panel");
var evalLogger = new Logger("eval-panel");

/*
██████  ██    ██ ████████ ████████  ██████  ███    ██ ███████
██   ██ ██    ██    ██       ██    ██    ██ ████   ██ ██
██████  ██    ██    ██       ██    ██    ██ ██ ██  ██ ███████
██   ██ ██    ██    ██       ██    ██    ██ ██  ██ ██      ██
██████   ██████     ██       ██     ██████  ██   ████ ███████
*/

function disableButtons(disable)
{
  if (disable)
  {
    // Enable the connection button.
    $("#connect-to-button").removeClass("disabled");
    $("#host-address").removeAttr("disabled");

    // Disable the debugger buttons.
    $(".debugger-buttons .btn-warning").addClass("disabled");
  }
  else
  {
    // Disable the connection button.
    $("#connect-to-button").addClass("disabled");
    $("#host-address").attr("disabled", true);

    // Enable the debugger buttons.
    $(".debugger-buttons .btn-warning").removeClass("disabled");
  }
}

function updateContinueStopButton(value)
{
  switch (value)
  {
    case button.stop:
    {
      env.isContActive = false;
      $("#continue-stop-button i").removeClass("fa-play");
      $("#continue-stop-button i").addClass("fa-stop");
    } break;
    case button.continue:
    {
      $("#continue-stop-button i").removeClass("fa-stop");
      $("#continue-stop-button i").addClass("fa-play");
      env.isContActive = true;
    } break;
  }
}

/*
██████  ██████        ██████   █████  ████████  █████
██   ██ ██   ██       ██   ██ ██   ██    ██    ██   ██
██████  ██████  █████ ██   ██ ███████    ██    ███████
██   ██ ██            ██   ██ ██   ██    ██    ██   ██
██████  ██            ██████  ██   ██    ██    ██   ██
*/

function getLinesFromRawData(raw)
{
  var lines = [];
  var sessionName = getSessionNameById(session.activeID);

  for (var i in raw)
  {
    if (raw[i].sourceName.endsWith(sessionName))
    {
      lines.push(raw[i].line);
    }
  }

  return lines;
}

function updateInvalidLines()
{
  if (client.debuggerObj)
  {
    var lines = getLinesFromRawData(client.debuggerObj.getBreakpointLines());

    if (lines.length != 0)
    {
      lines.sort(function(a, b){ return a - b} );

      for (var i = env.editor.session.getLength(); i > 0; i--) {
        if (lines.includes(i) === false)
        {
          env.editor.session.removeGutterDecoration(i - 1, "invalid-gutter-cell");
          env.editor.session.addGutterDecoration(i - 1, "invalid-gutter-cell");
        }
      }
    }
  }
}

function deleteBreakpointsFromEditor()
{
  for (var i in env.breakpointIds)
  {
    env.editor.session.clearBreakpoint(i);
  }

  resetPanel($("#breakpoints-content"));
}

function getbacktrace()
{
  var max_depth = 0;
  var user_depth = $("#backtrace-depth").val();

  if (user_depth != 0)
  {
    if (/[1-9][0-9]*/.exec(user_depth))
    {
      max_depth = parseInt(user_depth);
    }
    else
    {
      logger.err("Invalid maximum depth parameter.");
      return true;
    }
  }

  client.debuggerObj.encodeMessage("BI", [ JERRY_DEBUGGER_GET_BACKTRACE, max_depth ]);
}

function highlightCurrentLine(lineNumber) {
  lineNumber--;
  unhighlightLine();
  var Range = ace.require("ace/range").Range;
  marker.executed = env.editor.session.addMarker(new Range(lineNumber, 0, lineNumber, 1), "execute-marker", "fullLine");

  env.editor.session.addGutterDecoration(lineNumber, "execute-gutter-cell-marker");
  marker.lastMarked = lineNumber;
}

function unhighlightLine(){
  env.editor.getSession().removeMarker(marker.executed);
  env.editor.session.removeGutterDecoration(marker.lastMarked, "execute-gutter-cell-marker");
}

/*
██████   █████  ███    ██ ███████ ██      ███████
██   ██ ██   ██ ████   ██ ██      ██      ██
██████  ███████ ██ ██  ██ █████   ██      ███████
██      ██   ██ ██  ██ ██ ██      ██           ██
██      ██   ██ ██   ████ ███████ ███████ ███████
*/

function scrollDownToBottom(element)
{
  element.scrollTop(element.prop("scrollHeight"));
}

function resetPanel(element)
{
  element.empty();
}

function updateBacktracePanel(frame, info)
{
  var sourceName = info.func.sourceName || info;
  var line = info.line || "-";
  var func = info.func.name || "-";

  var panel = $("#backtrace-content");
  panel.append(
    "<div class='list-row'>" +
      "<div class='list-col list-col-0'>" + frame + "</div>" +
      "<div class='list-col list-col-1'>" + sourceName + "</div>" +
      "<div class='list-col list-col-2'>" + line + "</div>" +
      "<div class='list-col list-col-3'>" + func + "</div>" +
    "</div>"
  );
  scrollDownToBottom(panel);
}

function updateBreakpointsPanel()
{
  var panel = $("#breakpoints-content");
  resetPanel(panel);

  var activeBreakpoints = client.debuggerObj.getActiveBreakpoints();

  for (var i in activeBreakpoints)
  {
    var sourceName = activeBreakpoints[i].func.sourceName || "-";
    var line = activeBreakpoints[i].line || "-";
    var id = activeBreakpoints[i].activeIndex || "-";
    var func = activeBreakpoints[i].func.name || "-";

    panel.append(
      "<div class='list-row' id='br-" + line + "-" + id + "'>" +
        "<div class='list-col list-col-0'>" + sourceName + "</div>" +
        "<div class='list-col list-col-1'>" + line + "</div>" +
        "<div class='list-col list-col-2'>" + id + "</div>" +
        "<div class='list-col list-col-3'>" + func + "</div>" +
      "</div>"
    );
  }

  scrollDownToBottom(panel);
}

/*
███████ ███████ ███████ ███████ ██  ██████  ███    ██
██      ██      ██      ██      ██ ██    ██ ████   ██
███████ █████   ███████ ███████ ██ ██    ██ ██ ██  ██
     ██ ██           ██      ██ ██ ██    ██ ██  ██ ██
███████ ███████ ███████ ███████ ██  ██████  ██   ████
*/

function setWelcomeSession()
{
  filetab.isWelcome = true;

  // First start.
  if (getSessionById(0) == null)
  {
    var welcome = "/**\n" +
                  "* Welcome in the JerryScript Remote Debugger WebIDE.\n" +
                  "*\n" +
                  "* Open or create a new file to start the work please.\n" +
                  "*/\n";

    var eSession = new EditSession(welcome, "ace/mode/javascript");
    session.data.push(
    {
      id: 0,
      saved : true,
      name: "welcome.js",
      editSession: eSession
    });
  }

  updateFilePanel(0, "welcome.js", filetab.welcome);
  switchSession(0);

  // Enable the read only mode in the editor.
  env.editor.setReadOnly(true);
}

function createNewSession(name, data, tab, saved)
{
  var saved = saved || true;
  var tab = tab || filetab.work;

  var eSession = new EditSession(data, "ace/mode/javascript");
  // Store the edit session.
  session.nextID++;
  session.data.push(
  {
    id : session.nextID,
    saved : saved,
    name : name,
    editSession : eSession
  });

  updateFilePanel(session.nextID, name, tab);
  switchSession(session.nextID);
}

function getSessionNameById(id)
{
  for (var i in session.data)
  {
    if (session.data[i].id == id)
    {
      return session.data[i].name;
    }
  }

  return null;
}

function getSessionIdbyName(name)
{
  for (var i in session.data)
  {
    if (name.endsWith(session.data[i].name))
    {
      return session.data[i].id;
    }
  }

  return null;
}

function getSessionById(id)
{
  for (var i in session.data)
  {
    if (session.data[i].id == id)
    {
      return session.data[i].editSession;
    }
  }

  return null;
}

function deleteSessionByAttr(attr, value)
{
    var i = session.data.length;
    while(i--)
    {
      if(session.data[i]
         && session.data[i].hasOwnProperty(attr)
         && session.data[i][attr] === parseInt(value))
      {
        session.data.splice(i,1);
      }
    }
}

function switchSession(id)
{
  selectTab(id);

  // Set the session based on id.
  session.activeID = id;
  env.editor.setSession(getSessionById(id));

  if (client.debuggerObj &&
      env.lastBreakpoint != null &&
      env.lastBreakpoint.func.sourceName.endsWith(getSessionNameById(id))
      )
  {
    highlightCurrentLine(env.lastBreakpoint.line);
  }

  // Disable the read only mode from the editor.
  if (env.editor.getReadOnly())
  {
    env.editor.setReadOnly(false);
  }

  if (!client.debuggerObj)
  {
    deleteBreakpointsFromEditor();
  }
}

function getSessionNeighbourById(id)
{
  for (var i = 1; i < session.data.length; i++)
  {
    if (session.data[i].id === parseInt(id))
    {
      if (session.data[i - 1] !== undefined && session.data[i - 1].id !== 0)
      {
        return session.data[i - 1].id;
      }
      if (session.data[i + 1] !== undefined)
      {
        return session.data[i + 1].id;
      }
    }
  }

  return 0;
}

function sessionNameCheck(name, log)
{
  if (getSessionIdbyName(name) === null)
  {
    if (log)
    {
      logger.warn("Warning! The " + name + " is missing.\n");
    }

    return false;
  }

  return true;
}

function sessionSourceCheck(source, log)
{
  for (var i in session.data)
  {
    if (source.localeCompare(session.data[i].editSession.getValue()) == 0)
    {
      return true;
    }
  }

  if (log)
  {
    logger.warn("Warning! The source in the session is invalid!");
  }

  return false;
}

/*
████████  █████  ██████
   ██    ██   ██ ██   ██
   ██    ███████ ██████
   ██    ██   ██ ██   ██
   ██    ██   ██ ██████
*/

function updateFilePanel(id, name, type)
{
  if (filetab.isWelcome && type === filetab.work)
  {
    $(".file-tabs").empty();
    filetab.isWelcome = false;
  }

  var tab = "";

  tab += "<a href='javascript:void(0)' class='tablinks' id='tab-" + id + "'> " + name;
  if (type == filetab.work)
  {
    tab += "<i class='fa fa-times' aria-hidden='true'></i>";
  }
  tab += "</a>";

  $(".file-tabs").append(tab);

  //selectTab(id);

  $("#tab-" + id).on("click", function()
  {
    switchSession(id);
  });

  $("#tab-" + id + " i").on("click", function()
  {
    closeTab(id);
  });
}

function selectTab(id)
{
  // Get all elements with class="tablinks" and remove the class "active"
  var tablinks = $(".tablinks");
  for (var i = 0; i < tablinks.length; i++) {
    tablinks[i].className = tablinks[i].className.replace(" active", "");
  }

  // Set the current tab active.
  $("#tab-" + id)[0].className += " active";
}


function closeTab(id)
{
  // Remove the sesison tab from the session bar.
  $("#tab-" + id).remove();

  // If the selected session is the current session
  // let's switch to an other existing session.
  if (id == session.activeID)
  {
    var nID = getSessionNeighbourById(id);
    if (nID != 0)
    {
      switchSession(nID);
    }
    else
    {
      setWelcomeSession();
    }
  }

  // Delete the selected sesison.
  deleteSessionByAttr("id", id);
}

/*
██████  ███████  █████  ██████  ██    ██
██   ██ ██      ██   ██ ██   ██  ██  ██
██████  █████   ███████ ██   ██   ████
██   ██ ██      ██   ██ ██   ██    ██
██   ██ ███████ ██   ██ ██████     ██
*/

$(document).ready(function()
{
  // Init the ACE editor.
  env.editor.setTheme("ace/theme/chrome");
  var JavaScriptMode = ace.require("ace/mode/javascript").Mode;
  EditSession = ace.require("ace/edit_session").EditSession;
  env.editor.session.setMode(new JavaScriptMode());
  env.editor.setShowInvisibles(false);

  // Workaround for the auto scrolling when set the document value.
  // This is gonna be fixed in the next version of ace.
  env.editor.$blockScrolling = Infinity;

  setWelcomeSession();

  /*
  * Editor settings button event.
  */
  $("#editor-settings-button").on("change", function()
  {
    $(".control-panel-wrapper").toggleClass("block-control-panel-wrapper");
  });

  /*
  * File load button.
  */
  $("#open-file-button").on("click", function()
  {
    // Check for the various File API support.
    if (window.File && window.FileReader && window.FileList && window.Blob)
    {
      // Great success! All the File APIs are supported.
      // Open the file browser.
      $("#hidden-file-input").trigger("click");
    }
    else
    {
      logger.err("The File APIs are not fully supported in this browser.");
    }
  });

  /*
  * Manage the file input change
  */
  $("#hidden-file-input").change(function(evt)
  {
    // FileList object
    var files = evt.target.files;
    var valid = files.length, processed = 0;

    for (var i = 0; i < files.length; i++)
    {
      // Only process javascript files.
      if (!files[i].type.match("application/javascript"))
      {
        logger.err(files[i].name + " is not a Javascript file.");
        valid--;
        continue;
      }

      var stored = false;
      for (var j = 0; j < session.data.length; j++)
      {
        if (files[i].name.endsWith(session.data[j].name))
        {
          stored = true;
          break;
        }
      }
      if (stored)
      {
        logger.err(session.data[j].name + " is already loaded.");
        valid--;
        continue;
      }

      (function(file)
      {
        var reader = new FileReader();

        reader.onload = function(evt)
        {
          createNewSession(file.name, evt.target.result, filetab.work, true);
        }

        reader.onerror = function(evt)
        {
          if (evt.target.name.error === "NotReadableError")
          {
            logger.err(file.name + " file could not be read.");
          }
        }

        reader.readAsText(file, "utf-8");
      })(files[i]);
    }
  });

  /**
  * Modal "new File name" events.
  */
  $("#cancel-file-name").on("click", function()
  {
    $("#new-file-name").val("");
    $("#modal-info").empty();
  });

  $("#ok-file-name").on("click", function()
  {
    var info = $("#modal-info");
    var fileName = $("#new-file-name").val().trim();
    var valid = true;

    info.empty();
    var regex = /^([a-zA-Z0-9_\-]{3,}\.js)$/;
    if (!regex.test(fileName))
    {
      info.append("<p>The filename must be at least 3 characters long and must ends with '.js'.</p>");
      valid = false;
    }
    if (getSessionIdbyName(fileName) != null)
    {
      info.append("<p>This filename is already taken.</p>");
      valid = false;
    }

    if (valid)
    {
      createNewSession(fileName, "", filetab.work, false);

      $("#new-file-name").val("");
      $("#new-file-modal").modal("hide");
    }
  });

  /**
  * Save button event.
  */
  $("#save-file-button").on("click", function()
  {
    if (session.activeID == 0)
    {
      logger.err("You can not save the welcome.js file.");
    }
    else
    {
      var blob = new Blob([env.editor.session.getValue()], {type: "text/javascript;charset=utf-8"});
      saveAs(blob, getSessionNameById(session.activeID));
      $("#tab-" + session.activeID).removeClass("unsaved");
    }
  });

  /**
  * Editor setting events.
  */
  $("#theme").on("change", function()
  {
    env.editor.setTheme(this.value);
  });

  $("#fontsize").on("change", function()
  {
    env.editor.setFontSize(this.value);
  });

  $("#folding").on("change", function()
  {
    env.editor.session.setFoldStyle(this.value);
  });

  $("#keybinding").on("change", function()
  {
    env.editor.setKeyboardHandler(keybindings[this.value]);
  });

  $("#soft_wrap").on("change", function()
  {
    env.editor.setOption("wrap", this.value);
  });

  $("#select_style").on("change", function()
  {
    env.editor.setOption("selectionStyle", this.checked ? "line" : "text");
  });

  $("#highlight_active").on("change", function()
  {
    env.editor.setHighlightActiveLine(this.checked);
  });

  $("#display_indent_guides").on("change", function()
  {
    env.editor.setDisplayIndentGuides(this.checked);
  });

  $("#show_hidden").on("change", function()
  {
    env.editor.setShowInvisibles(this.checked);
  });

  $("#show_hscroll").on("change", function()
  {
    env.editor.setOption("hScrollBarAlwaysVisible", this.checked);
  });

  $("#show_vscroll").on("change", function()
  {
    env.editor.setOption("vScrollBarAlwaysVisible", this.checked);
  });

  $("#animate_scroll").on("change", function()
  {
    env.editor.setAnimatedScroll(this.checked);
  });

  $("#show_gutter").on("change", function()
  {
    env.editor.renderer.setShowGutter(this.checked);
  });

  $("#show_print_margin").on("change", function()
  {
    env.editor.renderer.setShowPrintMargin(this.checked);
  });

  $("#soft_tab").on("change", function()
  {
    env.editor.session.setUseSoftTabs(this.checked);
  });

  $("#highlight_selected_word").on("change", function()
  {
    env.editor.setHighlightSelectedWord(this.checked);
  });

  $("#enable_behaviours").on("change", function()
  {
    env.editor.setBehavioursEnabled(this.checked);
  });

  $("#fade_fold_widgets").on("change", function()
  {
    env.editor.setFadeFoldWidgets(this.checked);
  });

  $("#scrollPastEnd").on("change", function()
  {
    env.editor.setOption("scrollPastEnd", this.checked);
  });

  /**
  * Layout setting events.
  */
  $(".panel-switch").on("change", function(e)
  {
    var panel = e.target.id.split("-")[0];
    if ($(e.target).is(":checked"))
    {
      if (panel === "backtrace")
      {
        env.isBacktracePanelActive = true;
      }
      $("#" + panel + "-wrapper").show();
      env.numberOfHiddenPanel--;
    }
    else
    {
      if (panel === "backtrace")
      {
        env.isBacktracePanelActive = false;
      }
      $("#" + panel + "-wrapper").hide();
      env.numberOfHiddenPanel++;
    }

    if (env.numberOfHiddenPanel < $("#info-panels").children().length)
    {
      $("#editor-wrapper").removeClass("col-md-12");
      $("#editor-wrapper").addClass("col-md-6");
      $("#info-panels").show();
      env.editor.resize()
    }
    else
    {
      $("#editor-wrapper").removeClass("col-md-6");
      $("#editor-wrapper").addClass("col-md-12");
      $("#info-panels").hide();
      env.editor.resize()
    }
  });

  /**
  * Debugger action events.
  */
  $("#connect-to-button").on("click", function(e)
  {
    if ($(this).hasClass("disabled"))
    {
      return true;
    }

    if (client.debuggerObj)
    {
      logger.log("Debugger is connected.");
      return true;
    }

    if ($("#host-ip").val() == "")
    {
      logger.err("IP address expected.");
      return true;
    }

    if ($("#host-port").val() == "")
    {
      logger.err("Adress port expected.");
      return true;
    }

    var address = $("#host-ip").val() + ":" + $("#host-port").val();

    logger.log("Connect to: " + address);
    client.debuggerObj = new DebuggerClient(address);

    return true;
  });

  /*
  * Update the breakpoint lines after editor or session changes.
  */
  env.editor.on("change", function(e)
  {
    $("#tab-" + session.activeID).addClass("unsaved");
    if (client.debuggerObj)
    {
      updateInvalidLines();
    }
  });

  env.editor.on("changeSession", function(e)
  {
    if (client.debuggerObj)
    {
      updateInvalidLines();
    }
  });

  /*
  * Debugger action button events.
  */
  $("#continue-stop-button").on("click", function()
  {
    if ($(this).hasClass("disabled"))
    {
      return true;
    }

    if (env.isContActive)
    {
      updateContinueStopButton(button.stop);
      client.debuggerObj.encodeMessage("B", [ JERRY_DEBUGGER_CONTINUE ]);
    }
    else
    {
      updateContinueStopButton(button.continue);
      client.debuggerObj.encodeMessage("B", [ JERRY_DEBUGGER_STOP ]);
    }
  });

  $("#step-button").on("click", function()
  {
    if ($(this).hasClass("disabled"))
    {
      return true;
    }

    client.debuggerObj.encodeMessage("B", [ JERRY_DEBUGGER_STEP ]);
  });

  $("#next-button").on("click", function()
  {
    if ($(this).hasClass("disabled"))
    {
      return true;
    }

    client.debuggerObj.encodeMessage("B", [ JERRY_DEBUGGER_NEXT ]);
  });

  /*
  * Editor mouse click, breakpoint add/delete.
  */
  env.editor.on("guttermousedown", function(e)
  {
    if (client.debuggerObj)
    {
      var target = e.domEvent.target;
      if (target.className.indexOf("ace_gutter-cell") == -1)
      {
        return;
      }

      if (!env.editor.isFocused())
      {
        return;
      }

      if (e.clientX > 25 + target.getBoundingClientRect().left)
      {
        return;
      }

      var breakpoints = e.editor.session.getBreakpoints(row, 0);
      var row = e.getDocumentPosition().row;
      var lines = getLinesFromRawData(client.debuggerObj.getBreakpointLines());

      if (lines.includes(row + 1))
      {
        if(typeof breakpoints[row] === typeof undefined) {
          env.editor.session.setBreakpoint(row);
          env.breakpointIds[row] = client.debuggerObj.getNextBreakpointIndex();
          client.debuggerObj.setBreakpoint(getSessionNameById(session.activeID) + ":" + parseInt(row + 1));
        }
        else
        {
          client.debuggerObj.deleteBreakpoint(env.breakpointIds[row]);
          env.editor.session.clearBreakpoint(row);

          updateBreakpointsPanel();
        }
      }

      e.stop();
    }
  });
});

/*
 ██████ ██      ██ ███████ ███    ██ ████████
██      ██      ██ ██      ████   ██    ██
██      ██      ██ █████   ██ ██  ██    ██
██      ██      ██ ██      ██  ██ ██    ██
 ██████ ███████ ██ ███████ ██   ████    ██
*/

function DebuggerClient(address)
{
  logger.log("ws://" + address + "/jerry-debugger");

  var parseObj = null;
  var maxMessageSize = 0;
  var cpointerSize = 0;
  var littleEndian = true;
  var functions = { };
  var lineList = new Multimap();
  var lastBreakpointHit = null;
  var activeBreakpoints = { };
  var nextBreakpointIndex = 1;
  var backtraceFrame = 0;
  var evalResult = null;

  function assert(expr)
  {
    if (!expr)
    {
      throw new Error("Assertion failed.");
    }
  }

  function setUint32(array, offset, value)
  {
    if (littleEndian)
    {
      array[offset] = value & 0xff;
      array[offset + 1] = (value >> 8) & 0xff;
      array[offset + 2] = (value >> 16) & 0xff;
      array[offset + 3] = (value >> 24) & 0xff;
    }
    else
    {
      array[offset] = (value >> 24) & 0xff;
      array[offset + 1] = (value >> 16) & 0xff;
      array[offset + 2] = (value >> 8) & 0xff;
      array[offset + 3] = value & 0xff;
    }
  }

  /* Concat the two arrays. The first byte (opcode) of nextArray is ignored. */
  function concatUint8Arrays(baseArray, nextArray)
  {
    if (nextArray.byteLength <= 1)
    {
      /* Nothing to append. */
      return baseArray;
    }

    if (!baseArray)
    {
      /* Cut the first byte (opcode). */
      return nextArray.slice(1);
    }

    var baseLength = baseArray.byteLength;
    var nextLength = nextArray.byteLength - 1;

    var result = new Uint8Array(baseLength + nextLength);
    result.set(nextArray, baseLength - 1);

    /* This set operation overwrites the opcode. */
    result.set(baseArray);

    return result;
  }

  function cesu8ToString(array)
  {
    if (!array)
    {
      return "";
    }

    var length = array.byteLength;

    var i = 0;
    var result = "";

    while (i < length)
    {
      var chr = array[i];

      ++i;

      if (chr >= 0x7f)
      {
        if (chr & 0x20)
        {
          /* Three byte long character. */
          chr = ((chr & 0xf) << 12) | ((array[i] & 0x3f) << 6) | (array[i + 1] & 0x3f);
          i += 2;
        }
        else
        {
          /* Two byte long character. */
          chr = ((chr & 0x1f) << 6) | (array[i] & 0x3f);
          ++i;
        }
      }

      result += String.fromCharCode(chr);
    }

    return result;
  }

  function stringToCesu8(string)
  {
    assert(string != "");

    var length = string.length;
    var byteLength = length;

    for (var i = 0; i < length; i++)
    {
      var chr = string.charCodeAt(i);

      if (chr >= 0x7ff)
      {
        byteLength ++;
      }

      if (chr >= 0x7f)
      {
        byteLength++;
      }
    }

    var result = new Uint8Array(byteLength + 1 + 4);

    result[0] = JERRY_DEBUGGER_EVAL;

    setUint32(result, 1, byteLength);

    var offset = 5;

    for (var i = 0; i < length; i++)
    {
      var chr = string.charCodeAt(i);

      if (chr >= 0x7ff)
      {
        result[offset] = 0xe0 | (chr >> 12);
        result[offset + 1] = 0x80 | ((chr >> 6) & 0x3f);
        result[offset + 2] = 0x80 | (chr & 0x3f);
        offset += 3;
      }
      else if (chr >= 0x7f)
      {
        result[offset] = 0xc0 | (chr >> 6);
        result[offset + 1] = 0x80 | (chr & 0x3f);
      }
      else
      {
        result[offset] = chr;
        offset++;
      }
    }

    return result;
  }

  function breakpointToString(breakpoint)
  {
    var name = breakpoint.func.name;

    var result = breakpoint.func.sourceName;

    if (!result)
    {
      result = "<unknown>";
    }

    result += ":" + breakpoint.line;

    if (breakpoint.func.name)
    {
      result += " (in " + breakpoint.func.name + ")";
    }

    return result;
  }

  function Multimap()
  {
    /* Each item is an array of items. */

    var map = { };

    this.get = function(key)
    {
      var item = map[key];
      return item ? item : [ ];
    }

    this.insert = function(key, value)
    {
      var item = map[key];

      if (item)
      {
        item.push(value);
        return;
      }

      map[key] = [ value ];
    }

    this.delete = function(key, value)
    {
      var array = map[key];

      assert(array);

      var newLength = array.length - 1;
      var i = array.indexOf(value);

      assert(i != -1);

      array.splice(i, 1);

      array.length = newLength;
    }
  }

  client.socket = new WebSocket("ws://" + address + "/jerry-debugger");
  client.socket.binaryType = 'arraybuffer';

  function abortConnection(message)
  {
    assert(client.socket && client.debuggerObj);

    client.socket.close();
    client.socket = null;
    client.debuggerObj = null;

    logger.err("Abort connection: " + message);
    throw new Error(message);
  }

  client.socket.onerror = function(event)
  {
    if (client.socket)
    {
      client.socket = null;
      client.debuggerObj = null;
      logger.log("Connection closed.");
      // "Reset the editor".
      resetPanel($("#backtrace-content"));
      deleteBreakpointsFromEditor();
      unhighlightLine();
      disableButtons(true);
    }
  }
  client.socket.onclose = client.socket.onerror;

  client.socket.onopen = function(event)
  {
    logger.log("Connection created.");
    disableButtons(false);
  }

  function getFormatSize(format)
  {
    var length = 0;

    for (var i = 0; i < format.length; i++)
    {
      if (format[i] == "B")
      {
        length++;
        continue;
      }

      if (format[i] == "C")
      {
        length += cpointerSize;
        continue;
      }

      assert(format[i] == "I")

      length += 4;
    }

    return length;
  }

  function decodeMessage(format, message, offset)
  {
    /* Format: B=byte I=int32 C=cpointer.
     * Returns an array of decoded numbers. */

    var result = []
    var value;

    if (!offset)
    {
      offset = 0;
    }

    if (offset + getFormatSize(format) > message.byteLength)
    {
      abortConnection("received message too short.");
    }

    for (var i = 0; i < format.length; i++)
    {
      if (format[i] == "B")
      {
        result.push(message[offset])
        offset++;
        continue;
      }

      if (format[i] == "C" && cpointerSize == 2)
      {
        if (littleEndian)
        {
          value = message[offset] | (message[offset + 1] << 8);
        }
        else
        {
          value = (message[offset] << 8) | message[offset + 1];
        }

        result.push(value);
        offset += 2;
        continue;
      }

      assert(format[i] == "I" || (format[i] == "C" && cpointerSize == 4));

      if (littleEndian)
      {
        value = (message[offset] | (message[offset + 1] << 8)
                 | (message[offset + 2] << 16) | (message[offset + 3] << 24));
      }
      else
      {
        value = ((message[offset] << 24) | (message[offset + 1] << 16)
                 | (message[offset + 2] << 8) | message[offset + 3] << 24);
      }

      result.push(value);
      offset += 4;
    }

    return result;
  }

  function encodeMessage(format, values)
  {
    /* Format: B=byte I=int32 C=cpointer.
     * Sends a message after the encoding is completed. */

    var length = getFormatSize(format);

    var message = new Uint8Array(length);

    var offset = 0;

    for (var i = 0; i < format.length; i++)
    {
      var value = values[i];

      if (format[i] == "B")
      {
        message[offset] = value;
        offset++;
        continue;
      }

      if (format[i] == "C" && cpointerSize == 2)
      {
        if (littleEndian)
        {
          message[offset] = value & 0xff;
          message[offset + 1] = (value >> 8) & 0xff;
        }
        else
        {
          message[offset] = (value >> 8) & 0xff;
          message[offset + 1] = value & 0xff;
        }

        offset += 2;
        continue;
      }

      setUint32(message, offset, value);

      offset += 4;
    }

    client.socket.send(message);
  }

  function releaseFunction(message)
  {
    var byte_code_cp = decodeMessage("C", message, 1)[0];
    var func = functions[byte_code_cp];

    for (var i in func.lines)
    {
      lineList.delete(i, func);

      var breakpoint = func.lines[i];

      assert(i == breakpoint.line);

      if (breakpoint.activeIndex >= 0)
      {
        delete activeBreakpoints[breakpoint.activeIndex];
      }
    }

    delete functions[byte_code_cp];

    message[0] = JERRY_DEBUGGER_FREE_BYTE_CODE_CP;
    client.socket.send(message);
  }

  function getBreakpoint(breakpointData)
  {
      var returnValue = {};
      var func = functions[breakpointData[0]];
      var offset = breakpointData[1];

      if (offset in functions)
      {
        returnValue.breakpoint = func.offsets[offset];
        returnValue.at = true;
        return returnValue;
      }

      if (offset < functions.firstBreakpointOffset)
      {
        returnValue.breakpoint = func.offsets[firstBreakpointOffset];
        returnValue.at = true;
        return returnValue;
      }

      nearest_offset = -1;

      for (var current_offset in func.offsets)
      {
        if ((current_offset <= offset) && (current_offset > nearest_offset))
        {
          nearest_offset = current_offset;
        }
      }

      returnValue.breakpoint = func.offsets[nearest_offset];
      returnValue.at = false;
      return returnValue;
  }

  this.encodeMessage = encodeMessage;

  function ParseSource()
  {
    var source = "";
    var sourceData = null;
    var sourceName = "";
    var sourceNameData = null;
    var functionName = null;
    var stack = [{ is_func: false,
                   line: 1,
                   column: 1,
                   name: "",
                   source: "",
                   lines: [],
                   offsets: [] }];
    var newFunctions = [ ];

    this.receive = function(message)
    {
      switch (message[0])
      {
        case JERRY_DEBUGGER_PARSE_ERROR:
        {
          /* Parse error occured in JerryScript. */
          parseObj = null;
          return;
        }

        case JERRY_DEBUGGER_SOURCE_CODE:
        case JERRY_DEBUGGER_SOURCE_CODE_END:
        {
          sourceData = concatUint8Arrays(sourceData, message);

          if (message[0] == JERRY_DEBUGGER_SOURCE_CODE_END)
          {
            source = cesu8ToString(sourceData);
          }
          return;
        }

        case JERRY_DEBUGGER_SOURCE_CODE_NAME:
        case JERRY_DEBUGGER_SOURCE_CODE_NAME_END:
        {
          sourceNameData = concatUint8Arrays(sourceNameData, message);

          if (message[0] == JERRY_DEBUGGER_SOURCE_CODE_NAME_END)
          {
            sourceName = cesu8ToString(sourceNameData);
          }
          return;
        }

        case JERRY_DEBUGGER_FUNCTION_NAME:
        case JERRY_DEBUGGER_FUNCTION_NAME_END:
        {
          functionName = concatUint8Arrays(functionName, message);
          return;
        }

        case JERRY_DEBUGGER_PARSE_FUNCTION:
        {
          position = decodeMessage("II", message, 1);

          stack.push({ is_func: true,
                       line: position[0],
                       column: position[1],
                       name: cesu8ToString(functionName),
                       source: source,
                       sourceName: sourceName,
                       lines: [],
                       offsets: [] });
          functionName = null;
          return;
        }

        case JERRY_DEBUGGER_BREAKPOINT_LIST:
        case JERRY_DEBUGGER_BREAKPOINT_OFFSET_LIST:
        {
          var array;

          if (message.byteLength < 1 + 4)
          {
            abortConnection("message too short.");
          }

          if (message[0] == JERRY_DEBUGGER_BREAKPOINT_LIST)
          {
            array = stack[stack.length - 1].lines;
          }
          else
          {
            array = stack[stack.length - 1].offsets;
          }

          for (var i = 1; i < message.byteLength; i += 4)
          {
            array.push(decodeMessage("I", message, i)[0]);
          }
          return;
        }

        case JERRY_DEBUGGER_BYTE_CODE_CP:
        {
          var func = stack.pop();
          func.byte_code_cp = decodeMessage("C", message, 1)[0];

          lines = {}
          offsets = {}

          func.firstLine = (func.lines.length > 0) ? func.lines[0] : -1;

          for (var i = 0; i < func.lines.length; i++)
          {
            var breakpoint = { line: func.lines[i], offset: func.offsets[i], func: func, activeIndex: -1 };

            lines[breakpoint.line] = breakpoint;
            offsets[breakpoint.offset] = breakpoint;
          }

          func.lines = lines;
          func.offsets = offsets;

          newFunctions.push(func);

          if (stack.length > 0)
          {
            return;
          }

          func.source = source;
          func.sourceName = sourceName;
          // TODO: Create new sesison for internal eval.
          // if (sourceName === "")
          // {
          //   createNewSession("unknown.js", source, filetab.work, false);
          // }
          break;
        }

        case JERRY_DEBUGGER_RELEASE_BYTE_CODE_CP:
        {
          var byte_code_cp = decodeMessage("C", message, 1)[0];

          if (byte_code_cp in newFunctions)
          {
            delete newFunctions[byte_code_cp];
          }
          else
          {
            releaseFunction(message);
          }
          return;
        }

        default:
        {
          abortConnection("unexpected message.");
          return;
        }
      }

      for (var i = 0; i < newFunctions.length; i++)
      {
        var func = newFunctions[i];

        functions[func.byte_code_cp] = func

        for (var j in func.lines)
        {
          lineList.insert(j, func);
        }
      }

      parseObj = null;
    }
  }

  client.socket.onmessage = function(event)
  {
    var message = new Uint8Array(event.data);

    if (message.byteLength < 1)
    {
      abortConnection("message too short.");
    }

    if (cpointerSize == 0)
    {
      if (message[0] != JERRY_DEBUGGER_CONFIGURATION
          || message.byteLength != 4)
      {
        abortConnection("the first message must be configuration.");
      }

      maxMessageSize = message[1]
      cpointerSize = message[2]
      littleEndian = (message[3] != 0);

      if (cpointerSize != 2 && cpointerSize != 4)
      {
        abortConnection("compressed pointer must be 2 or 4 byte long.");
      }

      config = false;
      return;
    }

    if (parseObj)
    {
      parseObj.receive(message)
      return;
    }

    switch (message[0])
    {
      case JERRY_DEBUGGER_PARSE_ERROR:
      case JERRY_DEBUGGER_BYTE_CODE_CP:
      case JERRY_DEBUGGER_PARSE_FUNCTION:
      case JERRY_DEBUGGER_BREAKPOINT_LIST:
      case JERRY_DEBUGGER_SOURCE_CODE:
      case JERRY_DEBUGGER_SOURCE_CODE_END:
      case JERRY_DEBUGGER_SOURCE_CODE_NAME:
      case JERRY_DEBUGGER_SOURCE_CODE_NAME_END:
      case JERRY_DEBUGGER_FUNCTION_NAME:
      case JERRY_DEBUGGER_FUNCTION_NAME_END:
      {
        parseObj = new ParseSource()
        parseObj.receive(message)
        return;
      }

      case JERRY_DEBUGGER_RELEASE_BYTE_CODE_CP:
      {
        releaseFunction(message);
        return;
      }

      case JERRY_DEBUGGER_BREAKPOINT_HIT:
      case JERRY_DEBUGGER_EXCEPTION_HIT:
      {
        var breakpointData = decodeMessage("CI", message, 1);
        var breakpointRef = getBreakpoint(breakpointData);
        var breakpoint = breakpointRef.breakpoint;

        if (message[0] == JERRY_DEBUGGER_EXCEPTION_HIT)
        {
          logger.log("Exception throw detected (to disable automatic stop type exception 0)");
        }

        lastBreakpointHit = breakpoint;

        var breakpointInfo = "";
        if (breakpoint.offset.activeIndex >= 0)
        {
          breakpointInfo = " breakpoint:" + breakpoint.offset.activeIndex + " ";
        }

        logger.log("Stopped "
                   + (breakpoint.at ? "at " : "around ")
                   + breakpointInfo
                   + breakpointToString(breakpoint));

        env.lastBreakpoint = breakpoint;

        updateContinueStopButton(button.continue);

        if (sessionNameCheck(breakpoint.func.sourceName, true))
        {
          sessionSourceCheck(breakpoint.func.source, true);
        }

        // Go the the right session.
        var sID = getSessionIdbyName(breakpoint.func.sourceName);
        if (sID != null && sID != session.activeID)
        {
          // Remove the highlite from the current session.
          unhighlightLine();

          // Change the session.
          switchSession(sID);

        }

        if (sID == session.activeID)
        {
          highlightCurrentLine(breakpoint.line);
          updateInvalidLines();
        }

        // Show the backtrace on the panel.
        if (env.isBacktracePanelActive)
        {
          getbacktrace();
        }

        return;
      }

      case JERRY_DEBUGGER_BACKTRACE:
      case JERRY_DEBUGGER_BACKTRACE_END:
      {
        resetPanel($("#backtrace-content"));
        for (var i = 1; i < message.byteLength; i += cpointerSize + 4)
        {
          var breakpointData = decodeMessage("CI", message, i);

          breakpoint = getBreakpoint(breakpointData).breakpoint;

          if (env.clBacktrace)
          {
            logger.log("  frame "
                        + backtraceFrame
                        + ": "
                        + breakpointToString(breakpoint));
          }
          updateBacktracePanel(backtraceFrame, breakpoint);

          ++backtraceFrame;
        }

        if (env.clBacktrace)
        {
          env.clBacktrace = false;
        }

        if (message[0] == JERRY_DEBUGGER_BACKTRACE_END)
        {
          backtraceFrame = 0;
        }
        return;
      }

      case JERRY_DEBUGGER_EVAL_RESULT:
      case JERRY_DEBUGGER_EVAL_RESULT_END:
      case JERRY_DEBUGGER_EVAL_ERROR:
      case JERRY_DEBUGGER_EVAL_ERROR_END:
      {
        env.evalResult = concatUint8Arrays(env.evalResult, message);

        if (message[0] == JERRY_DEBUGGER_EVAL_RESULT_END)
        {
          evalLogger.log(cesu8ToString(env.evalResult));
          env.evalResult = null;
          return;
        }

        if (message[0] == JERRY_DEBUGGER_EVAL_ERROR_END)
        {
          evalLogger.err("Uncaught exception: " + cesu8ToString(env.evalResult));
          env.evalResult = null;
          return;
        }

        return;
      }

      default:
      {
        abortConnection("unexpected message.");
        return;
      }
    }
  }

  function insertBreakpoint(breakpoint)
  {
    if (breakpoint.activeIndex < 0)
    {
      breakpoint.activeIndex = nextBreakpointIndex;
      activeBreakpoints[nextBreakpointIndex] = breakpoint;
      nextBreakpointIndex++;

      var values = [ JERRY_DEBUGGER_UPDATE_BREAKPOINT,
                     1,
                     breakpoint.func.byte_code_cp,
                     breakpoint.offset ];

      encodeMessage("BBCI", values);
    }

    logger.log("Breakpoint " + breakpoint.activeIndex + " at " + breakpointToString(breakpoint));
    updateBreakpointsPanel();
  }

  this.setBreakpoint = function(str)
  {
    line = /^(.+):([1-9][0-9]*)$/.exec(str);

    if (line)
    {
      var functionList = lineList.get(line[2]);

      for (var i = 0; i < functionList.length; ++i)
      {
        var func = functionList[i];
        var sourceName = func.sourceName;

        if (sourceName == line[1]
            || sourceName.endsWith("/" + line[1])
            || sourceName.endsWith("\\" + line[1]))
        {
          insertBreakpoint(func.lines[line[2]]);
        }
      }
    }
    else
    {
      for (var i in functions)
      {
        var func = functions[i];

        if (func.name == str && func.firstLine >= 0)
        {
          insertBreakpoint(func.lines[func.firstLine]);
        }
      }
    }
  }

  this.sendExceptionConfig = function(enable)
  {
    if (enable == "")
    {
      logger.err("Argument required");
      return;
    }

    if (enable == 1)
    {
      logger.log("Stop at exception enabled");
    }
    else if (enable == 0)
    {
      logger.log("Stop at exception disabled");
    }
    else
    {
      logger.log("Invalid input. Usage 1: [Enable] or 0: [Disable].");
      return;
    }

    encodeMessage("BB", [ JERRY_DEBUGGER_EXCEPTION_CONFIG, enable ]);
  }

  this.deleteBreakpoint = function(index)
  {
    breakpoint = activeBreakpoints[index];

    if (index == "all")
    {
      var found = false;

      for (var i in activeBreakpoints)
      {
        delete activeBreakpoints[i];
        found = true;
      }

      if (!found)
      {
        logger.log("No active breakpoints.")
      }
    }

    else if (!breakpoint)
    {
      logger.err("No breakpoint found with index " + index);
      return;
    }

    assert(breakpoint.activeIndex == index);

    delete activeBreakpoints[index];
    breakpoint.activeIndex = -1;

    var values = [ JERRY_DEBUGGER_UPDATE_BREAKPOINT,
                   0,
                   breakpoint.func.byte_code_cp,
                   breakpoint.offset ];

    encodeMessage("BBCI", values);

    logger.log("Breakpoint " + index + " is deleted.");
  }

  this.listBreakpoints = function()
  {
    logger.log("List of active breakpoints:");
    var found = false;

    for (var i in activeBreakpoints)
    {
      logger.log("  breakpoint " + i + " at " + breakpointToString(activeBreakpoints[i]));
      found = true;
    }

    if (!found)
    {
      logger.log("  no active breakpoints");
    }
  }

  this.sendResumeExec = function(command)
  {
    if (!lastBreakpointHit)
    {
      logger.log("This command is allowed only if JavaScript execution is stopped at a breakpoint.");
      return;
    }

    encodeMessage("B", [ command ]);

    lastBreakpointHit = null;
  }

  this.sendGetBacktrace = function(depth)
  {
    if (!lastBreakpointHit)
    {
      logger.err("This command is allowed only if JavaScript execution is stopped at a breakpoint.");
      return;
    }

    encodeMessage("BI", [ JERRY_DEBUGGER_GET_BACKTRACE, max_depth ]);

    logger.log("Backtrace:");
  }

  this.sendEval = function(str)
  {
    if (!lastBreakpointHit)
    {
      logger.err("This command is allowed only if JavaScript execution is stopped at a breakpoint.");
      return;
    }

    if (str == "")
    {
      logger.err("Argument required");
      return;
    }

    var array = stringToCesu8(str);
    var byteLength = array.byteLength;

    if (byteLength <= maxMessageSize)
    {
      client.socket.send(array);
      return;
    }

    client.socket.send(array.slice(0, maxMessageSize));

    var offset = maxMessageSize - 1;

    while (offset < byteLength)
    {
      array[offset] = JERRY_DEBUGGER_EVAL_PART;
      client.socket.send(array.slice(offset, offset + maxMessageSize));
      offset += maxMessageSize - 1;
    }
  }

  this.printSource = function()
  {
    if (lastBreakpointHit)
    {
      logger.log(lastBreakpointHit.func.source);
    }
  }

  this.dump = function()
  {
    for (var i in functions)
    {
      var func = functions[i];
      var sourceName = func.sourceName;

      if (!sourceName)
      {
        sourceName = "<unknown>";
      }

      logger.log("Function 0x"
                 + Number(i).toString(16)
                 + " '"
                 + func.name
                 + "' at "
                 + sourceName
                 + ":"
                 + func.line
                 + ","
                 + func.column);

      for (var j in func.lines)
      {
        var active = "";

        if (func.lines[j].active >= 0)
        {
          active = " (active: " + func.lines[j].active + ")";
        }

        logger.log("  Breakpoint line: " + j + " at memory offset: " + func.lines[j].offset + active);
      }
    }
  }

  this.getActiveBreakpoints = function ()
  {
    return activeBreakpoints;
  }

  this.getNextBreakpointIndex = function ()
  {
    return nextBreakpointIndex;
  }

  this.getBreakpointLines = function()
  {
    var result = [];
    for (var i in functions)
    {
      var func = functions[i];
      for (var j in func.lines)
      {
        result.push(
          {
            line: parseInt(j),
            sourceName: func.sourceName
          });
      }
    }
    return result;
  }
}

function evalCommand(event)
{
  if (event.keyCode != 13)
  {
    return true;
  }

  var input = env.evalInput.val().trim();

  input = /^([a-zA-Z]+)(?:\s+([^\s].*)|)$/.exec(input);

  if (!input)
  {
    evalLogger.err("Invalid command");
    env.evalInput.val('');
    return true;
  }

  if (!client.debuggerObj)
  {
    evalLogger.err("Debugger is NOT connected");

    env.evalInput.val('');
    return true;
  }

  if (input[1] === "e" || input[1] === "eval")
  {
    client.debuggerObj.sendEval(input[2]);
  }
  else
  {
    evalLogger.err("Invalid command");
  }

  env.evalInput.val('');
  return true;
}
