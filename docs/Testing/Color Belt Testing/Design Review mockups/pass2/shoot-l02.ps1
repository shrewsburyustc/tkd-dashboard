# shoot-l02.ps1: pass 2 L-02's shots (rulebook v1.053, v1.130). The event roster in a narrow window beside
# the left panel: 683 wide with a mouse (Standard and Largest panel), 700 wide touch (Standard and
# Largest), and 820 touch (Standard), today or after. Run from the worktree root with the preview on
# 5191 and the screenshot browser on 9351, signed in as admin on the preview's fresh data.
#   $args[0] = 'today' or 'after' (the file name's part); the code in the working tree decides which one
#   it really is: "after" = the prototype (ROSTER_ROOM 648 + the two wraps), "today" = the committed code.
$env:TKD_CDP_PORT = '9351'
$c = 'docs/Design Review/tools/cdp.mjs'
$d = 'docs/Testing/Color Belt Testing/Design Review mockups/pass2'
$tag = $args[0]
function Pin { if ((node $c eval "!!document.querySelector('.pin-input')") -eq 'true') { node $c type '.pin-input' '2580' | Out-Null; Start-Sleep 2 } }
# name, width, height, touch ('' or 'touch'), panel ('standard' | 'largest'), class to show
$states = @(
  @('683m-std', 683, 768, '', 'standard', 'Little Tiger + White'),
  @('683m-lg', 683, 768, '', 'largest', 'Little Tiger + White'),
  @('700t-std', 700, 900, 'touch', 'standard', 'Little Tiger + White'),
  @('700t-lg', 700, 900, 'touch', 'largest', 'Little Tiger + White'),
  @('820t-std', 820, 1180, 'touch', 'standard', 'Little Tiger + White'),
  @('820t-gcd', 820, 1180, 'touch', 'standard', 'Group C + D'),
  @('820t-ga', 820, 1180, 'touch', 'standard', 'Group A') # the Removed rows: "Moved to private testing, Tue, Dec 1"
)
# $args[1] (optional) = one state's name: shoot only that one
$only = $args[1]
if ($only) { $states = @($states | Where-Object { $_[0] -eq $only }) }
foreach ($s in $states) {
  if ($s[3]) { node $c size $s[1] $s[2] $s[3] | Out-Null } else { node $c size $s[1] $s[2] | Out-Null }
  node $c open 'http://localhost:5191/' | Out-Null
  Start-Sleep 3
  Pin
  node $c eval "__tkdPreview.resetTesting(); __tkdPreview.setRole('admin'); __tkdPreview.panelSizeElsewhere('$($s[4])'); location.hash='#testing/color-belt/event/000001e0-0000-4000-8000-000000000001'; 'ok'" | Out-Null
  node $c reload | Out-Null
  Start-Sleep 3
  Pin
  node $c wait 'Students' 6000 | Out-Null
  node $c click $s[5] | Out-Null
  Start-Sleep 1
  node $c eval "(() => { const t=document.querySelector('.ev-roster'); if (t) t.scrollIntoView({ block: 'start' }); window.scrollBy(0, -140); return 'ok'; })()" | Out-Null
  node $c move 5 5 | Out-Null
  node $c shot "$d/l02-$($s[0])-$tag.png" | Out-Null
  node $c eval "(() => { const m=document.querySelector('main.shell-content'); const r=document.querySelector('.ev-roster'); const b=r ? r.getBoundingClientRect() : null; return 'room=' + (m ? m.dataset.pageRoom : '?') + ' roster=' + (b ? Math.round(b.left) + ',' + Math.round(b.top) + ',' + Math.round(b.width) + ',' + Math.round(b.height) : 'none') + ' phone-rows=' + document.querySelectorAll('.ev-srow.is-phone').length; })()"
  Write-Output "shot $($s[0]) $tag"
}
node $c eval "__tkdPreview.panelSizeElsewhere('standard'); __tkdPreview.resetTesting(); 'reset'" | Out-Null
node $c size 1280 800 | Out-Null
