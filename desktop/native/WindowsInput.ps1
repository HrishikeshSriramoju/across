$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Web.Extensions
$source = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public static class AcrossInput {
  const int WH_KEYBOARD_LL=13, WH_MOUSE_LL=14;
  const uint KEYUP=2, EXTENDED=1, MOVE=1, ABSOLUTE=0x8000, VIRTUALDESK=0x4000;
  static readonly UIntPtr Tag = new UIntPtr(0x41435253);
  static Hook keyboardProc=KeyboardHook, mouseProc=MouseHook;
  static IntPtr keyboardHook,mouseHook;
  static Form dispatcher;
  static bool remote, shuttingDown, havePoint;
  static int lastX,lastY;
  static long heartbeat;
  static readonly HashSet<int> physicalKeys=new HashSet<int>();
  static readonly HashSet<int> shortcutKeys=new HashSet<int>(),quietKeys=new HashSet<int>();
  static readonly List<Dictionary<string,object>> shortcutBindings=new List<Dictionary<string,object>>();
  static readonly ushort[] modifierKeys=new ushort[]{160,161,162,163,164,165,91,92};
  static readonly HashSet<int> injectedKeys=new HashSet<int>();
  static readonly HashSet<int> injectedButtons=new HashSet<int>();
  static readonly Dictionary<string,ushort> keys=BuildKeys();
  static readonly JavaScriptSerializer json=new JavaScriptSerializer { MaxJsonLength=16384, RecursionLimit=16 };
  static readonly object outputLock=new object();
  delegate IntPtr Hook(int n,IntPtr w,IntPtr l);
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int x,y; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEHOOK { public POINT pt; public uint data,flags,time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct KEYHOOK { public uint vk,scan,flags,time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx,dy; public uint mouseData,flags,time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct KEYINPUT { public ushort vk,scan; public uint flags,time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mouse; [FieldOffset(0)] public KEYINPUT key; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTUNION data; }
  [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SetWindowsHookEx(int type,Hook callback,IntPtr module,uint thread);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook,int n,IntPtr w,IntPtr l);
  [DllImport("kernel32.dll",CharSet=CharSet.Auto)] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint n,INPUT[] inputs,int size);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

  static Dictionary<string,ushort> BuildKeys() {
    var d=new Dictionary<string,ushort>(StringComparer.Ordinal);
    for(int i=0;i<26;i++) d["Key"+(char)('A'+i)]=(ushort)(65+i);
    for(int i=0;i<10;i++) { d["Digit"+i]=(ushort)(48+i); d["Numpad"+i]=(ushort)(96+i); }
    for(int i=1;i<=24;i++) d["F"+i]=(ushort)(111+i);
    string[] names={"Backspace","Tab","Enter","ShiftLeft","ShiftRight","ControlLeft","ControlRight","AltLeft","AltRight","Pause","CapsLock","Escape","Space","PageUp","PageDown","End","Home","ArrowLeft","ArrowUp","ArrowRight","ArrowDown","PrintScreen","Insert","Delete","MetaLeft","MetaRight","ContextMenu","NumLock","ScrollLock","NumpadMultiply","NumpadAdd","NumpadSubtract","NumpadDecimal","NumpadDivide","Semicolon","Equal","Comma","Minus","Period","Slash","Backquote","BracketLeft","Backslash","BracketRight","Quote"};
    ushort[] values={8,9,13,160,161,162,163,164,165,19,20,27,32,33,34,35,36,37,38,39,40,44,45,46,91,92,93,144,145,106,107,109,110,111,186,187,188,189,190,191,192,219,220,221,222};
    for(int i=0;i<names.Length;i++) d[names[i]]=values[i];
    return d;
  }
  static string KeyName(KEYHOOK k) {
    int vk=(int)k.vk;
    if(vk==16) vk=k.scan==54?161:160;
    if(vk==17) vk=(k.flags&1)!=0?163:162;
    if(vk==18) vk=(k.flags&1)!=0?165:164;
    if(vk==13 && (k.flags&1)!=0) return "NumpadEnter";
    foreach(var pair in keys) if(pair.Value==vk) return pair.Key;
    return null;
  }
  static void Emit(object value) {
    try { lock(outputLock) { Console.Out.WriteLine(json.Serialize(value)); Console.Out.Flush(); } }
    catch { Shutdown(); }
  }
  static IntPtr KeyboardHook(int n,IntPtr w,IntPtr l) {
    if(n<0) return CallNextHookEx(keyboardHook,n,w,l);
    KEYHOOK k=(KEYHOOK)Marshal.PtrToStructure(l,typeof(KEYHOOK));
    if(k.extra==Tag || (k.flags&0x10)!=0) return CallNextHookEx(keyboardHook,n,w,l);
    int msg=w.ToInt32(); bool down=msg==0x100||msg==0x104;
    if(down) physicalKeys.Add((int)k.vk); else physicalKeys.Remove((int)k.vk);
    bool ctrl=physicalKeys.Contains(17)||physicalKeys.Contains(162)||physicalKeys.Contains(163);
    bool alt=physicalKeys.Contains(18)||physicalKeys.Contains(164)||physicalKeys.Contains(165);
    if(shortcutKeys.Contains((int)k.vk)) { if(!down)shortcutKeys.Remove((int)k.vk);return new IntPtr(1); }
    if(quietKeys.Contains((int)k.vk)) {if(!down)quietKeys.Remove((int)k.vk);return new IntPtr(1);}
    if(down) {
      string name=KeyName(k);
      var mods=new HashSet<string>();if(ctrl)mods.Add("Control");if(alt)mods.Add("Alt");if(physicalKeys.Contains(16)||physicalKeys.Contains(160)||physicalKeys.Contains(161))mods.Add("Shift");if(physicalKeys.Contains(91)||physicalKeys.Contains(92))mods.Add("Meta");
      foreach(var binding in shortcutBindings) {
        object raw;var wanted=new HashSet<string>();if(binding.TryGetValue("modifiers",out raw))foreach(object item in (object[])raw)wanted.Add((string)item);
        if(Text(binding,"key")!=name||!wanted.SetEquals(mods))continue;
        shortcutKeys.Add((int)k.vk);
        foreach(ushort vk in modifierKeys)if(physicalKeys.Contains(vk)) {quietKeys.Add(vk);if(remote){var data=new KEYHOOK {vk=vk};string key=KeyName(data);if(key!=null)Emit(new {type="key",key=key,down=false});}Key(vk,false,ExtendedKey(vk));}
        Emit(new {type="shortcut",action=Text(binding,"action")});return new IntPtr(1);
      }
    }
    if(remote && down && k.vk==27 && ctrl && alt) {
      remote=false; Release(); Emit(new {type="panic"}); return new IntPtr(1);
    }
    if(remote) { string name=KeyName(k); if(name!=null) Emit(new {type="key",key=name,down=down}); return new IntPtr(1); }
    return CallNextHookEx(keyboardHook,n,w,l);
  }
  static IntPtr MouseHook(int n,IntPtr w,IntPtr l) {
    if(n<0) return CallNextHookEx(mouseHook,n,w,l);
    MOUSEHOOK m=(MOUSEHOOK)Marshal.PtrToStructure(l,typeof(MOUSEHOOK));
    if(m.extra==Tag || (m.flags&1)!=0) return CallNextHookEx(mouseHook,n,w,l);
    int msg=w.ToInt32();
    if(msg==0x200) {
      int dx=havePoint?m.pt.x-lastX:0,dy=havePoint?m.pt.y-lastY:0;
      Emit(new {type="move",x=m.pt.x,y=m.pt.y,dx=dx,dy=dy});
      if(!remote) { lastX=m.pt.x; lastY=m.pt.y; havePoint=true; }
    } else if(remote) {
      if(msg==0x20A || msg==0x20E) { double delta=(short)(m.data>>16)/120.0; Emit(new {type="scroll",dx=msg==0x20E?delta:0,dy=msg==0x20A?delta:0}); }
      else { int button=msg==0x201||msg==0x202?0:msg==0x204||msg==0x205?2:msg==0x207||msg==0x208?1:msg==0x20B||msg==0x20C?(((m.data>>16)&0xffff)==1?3:4):-1;
        if(button>=0) Emit(new {type="button",button=button,down=msg==0x201||msg==0x204||msg==0x207||msg==0x20B}); }
    }
    return remote?new IntPtr(1):CallNextHookEx(mouseHook,n,w,l);
  }
  static bool ExtendedKey(ushort vk) { return vk==163||vk==165||vk==91||vk==92||vk==93||vk==111||vk==144||(vk>=33&&vk<=46); }
  static void Send(INPUT input) { if(SendInput(1,new INPUT[]{input},Marshal.SizeOf(typeof(INPUT)))!=1) throw new InvalidOperationException("Input injection failed; the target may have higher privileges."); }
  static void Key(ushort vk,bool down,bool extended) {
    INPUT i=new INPUT(); i.type=1; i.data.key=new KEYINPUT {vk=vk,flags=(down?0:KEYUP)|(extended?EXTENDED:0),extra=Tag}; Send(i);
    int tracked=vk|(extended?0x100:0); if(down) injectedKeys.Add(tracked); else injectedKeys.Remove(tracked);
  }
  static void Button(int b,bool down) {
    uint flags=b==0?(down?2u:4u):b==1?(down?0x20u:0x40u):b==2?(down?8u:16u):(down?0x80u:0x100u);
    INPUT i=new INPUT(); i.data.mouse=new MOUSEINPUT {flags=flags,mouseData=b>=3?(uint)(b-2):0,extra=Tag}; Send(i);
    if(down) injectedButtons.Add(b); else injectedButtons.Remove(b);
  }
  static void Release() {
    foreach(int tracked in new List<int>(injectedKeys)) { try { Key((ushort)(tracked&255),false,(tracked&0x100)!=0); } catch {} }
    foreach(int b in new List<int>(injectedButtons)) { try { Button(b,false); } catch {} }
    injectedKeys.Clear(); injectedButtons.Clear();
  }
  static int Number(Dictionary<string,object> d,string key,int min,int max) {
    object v; if(!d.TryGetValue(key,out v) || !(v is int || v is long || v is decimal || v is double)) throw new ArgumentException("Invalid "+key);
    double value=Convert.ToDouble(v); if(Double.IsNaN(value)||Double.IsInfinity(value)||value<min||value>max) throw new ArgumentException("Invalid "+key);
    return (int)Math.Round(value);
  }
  static bool Boolean(Dictionary<string,object> d,string key) { object v; if(!d.TryGetValue(key,out v)||!(v is bool)) throw new ArgumentException("Invalid "+key); return (bool)v; }
  static double WheelNumber(Dictionary<string,object> d,string key) {
    object v; if(!d.TryGetValue(key,out v)||!(v is int||v is long||v is decimal||v is double)) throw new ArgumentException("Invalid "+key);
    double value=Convert.ToDouble(v); if(Double.IsNaN(value)||Double.IsInfinity(value)||Math.Abs(value)>100) throw new ArgumentException("Invalid "+key); return value;
  }
  static string Text(Dictionary<string,object> d,string key) { object v; if(!d.TryGetValue(key,out v)||!(v is string)) throw new ArgumentException("Invalid "+key); return (string)v; }
  static void Move(int x,int y) {
    int left=GetSystemMetrics(76),top=GetSystemMetrics(77),width=GetSystemMetrics(78),height=GetSystemMetrics(79);
    if(x<left||x>=left+width||y<top||y>=top+height) throw new ArgumentException("Position is outside the desktop");
    INPUT i=new INPUT(); i.data.mouse=new MOUSEINPUT {dx=(int)Math.Round((x-left)*65535.0/Math.Max(1,width-1)),dy=(int)Math.Round((y-top)*65535.0/Math.Max(1,height-1)),flags=MOVE|ABSOLUTE|VIRTUALDESK,extra=Tag}; Send(i);
  }
  static void Command(string line) {
    try {
      var d=json.DeserializeObject(line) as Dictionary<string,object>; if(d==null) throw new ArgumentException("Invalid command");
      string op=Text(d,"op");
      if(op=="heartbeat") { heartbeat=Stopwatch.GetTimestamp(); return; }
      if(op=="shortcuts") {shortcutBindings.Clear();object raw;if(d.TryGetValue("bindings",out raw))foreach(object item in (object[])raw){var binding=item as Dictionary<string,object>;if(binding!=null&&shortcutBindings.Count<3)shortcutBindings.Add(binding);}return;}
      if(op=="quit") { Shutdown(); return; }
      if(op=="release") { remote=false; Release(); return; }
      if(op=="remote") {
        remote=Boolean(d,"enabled"); heartbeat=Stopwatch.GetTimestamp();
        foreach(ushort vk in modifierKeys)Key(vk,false,ExtendedKey(vk));
        if(remote) { lastX=GetSystemMetrics(76)+GetSystemMetrics(78)/2;lastY=GetSystemMetrics(77)+GetSystemMetrics(79)/2;Move(lastX,lastY);havePoint=true; }
        else { POINT p;if(GetCursorPos(out p)) {lastX=p.x;lastY=p.y;havePoint=true;} Release(); }
        return;
      }
      if(op=="warp") { int x=Number(d,"x",-100000,100000),y=Number(d,"y",-100000,100000); Move(x,y);lastX=x;lastY=y;havePoint=true;return; }
      if(op!="inject") throw new ArgumentException("Unknown command");
      object ev; if(!d.TryGetValue("event",out ev)) throw new ArgumentException("Missing event");
      var e=ev as Dictionary<string,object>; if(e==null) throw new ArgumentException("Invalid event");
      string type=Text(e,"type");
      if(type=="move") Move(Number(e,"x",-100000,100000),Number(e,"y",-100000,100000));
      else if(type=="key") { string name=Text(e,"key"); ushort vk; if(name=="NumpadEnter") vk=13; else if(!keys.TryGetValue(name,out vk)) throw new ArgumentException("Unsupported key"); Key(vk,Boolean(e,"down"),name=="NumpadEnter"||ExtendedKey(vk)); }
      else if(type=="button") Button(Number(e,"button",0,4),Boolean(e,"down"));
      else if(type=="scroll") { int dx=(int)Math.Round(WheelNumber(e,"dx")*120),dy=(int)Math.Round(WheelNumber(e,"dy")*120); if(dy!=0) {INPUT i=new INPUT();i.data.mouse=new MOUSEINPUT {flags=0x800,mouseData=unchecked((uint)dy),extra=Tag};Send(i);} if(dx!=0) {INPUT i=new INPUT();i.data.mouse=new MOUSEINPUT {flags=0x1000,mouseData=unchecked((uint)dx),extra=Tag};Send(i);} }
      else throw new ArgumentException("Unsupported event");
      heartbeat=Stopwatch.GetTimestamp();
    } catch(Exception e) { Emit(new {type="error",message=e.Message}); }
  }
  static void Shutdown() {
    if(shuttingDown) return; shuttingDown=true;remote=false;Release();
    if(keyboardHook!=IntPtr.Zero) UnhookWindowsHookEx(keyboardHook);
    if(mouseHook!=IntPtr.Zero) UnhookWindowsHookEx(mouseHook);
    Application.ExitThread();
  }
  [STAThread] public static void Run() {
    SetProcessDPIAware();
    dispatcher=new Form(); IntPtr handle=dispatcher.Handle;
    IntPtr module=GetModuleHandle(null);
    keyboardHook=SetWindowsHookEx(WH_KEYBOARD_LL,keyboardProc,module,0);
    mouseHook=SetWindowsHookEx(WH_MOUSE_LL,mouseProc,module,0);
    bool trusted=keyboardHook!=IntPtr.Zero && mouseHook!=IntPtr.Zero;
    Emit(new {type="ready",trusted=trusted,shortcuts=true,platform="win32",bounds=new {x=GetSystemMetrics(76),y=GetSystemMetrics(77),width=GetSystemMetrics(78),height=GetSystemMetrics(79)}});
    if(!trusted) { Shutdown(); return; }
    heartbeat=Stopwatch.GetTimestamp();
    var timer=new System.Windows.Forms.Timer(); timer.Interval=250;
    timer.Tick+=(s,e)=> {if((remote||injectedKeys.Count>0||injectedButtons.Count>0)&&(Stopwatch.GetTimestamp()-heartbeat)/(double)Stopwatch.Frequency>2) {remote=false;Release();Emit(new {type="panic",reason="heartbeat-timeout"});}}; timer.Start();
    var reader=new Thread(()=> {try {string line;while((line=Console.ReadLine())!=null) {if(line.Length>16384) continue; string command=line;dispatcher.BeginInvoke(new Action(()=>Command(command)));}}catch {}finally {try {dispatcher.BeginInvoke(new Action(Shutdown));}catch {}}});reader.IsBackground=true;reader.Start();
    try { Application.Run(); } finally { timer.Stop();Shutdown();dispatcher.Dispose(); }
  }
}
'@
Add-Type -TypeDefinition $source -ReferencedAssemblies System.Windows.Forms,System.Web.Extensions,System.Core
[AcrossInput]::Run()
