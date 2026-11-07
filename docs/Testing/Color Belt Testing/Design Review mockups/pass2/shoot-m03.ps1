# shoot-m03.ps1: pass 2 M-03's shots. The ⋯ menu of a removed student with money (Owen Reed, withdrawn
# after paying) and of a cancelled private testing with money (Emma Ross, $85 paid): today, the admin's
# menu after (Print receipt first), and option A for staff (a ⋯ with only Print receipt), at the four
# review sizes. Run from the worktree root with the preview on 5191 and the screenshot browser on 9351,
# signed in as admin, AFTER Owen Reed was withdrawn in the preview.
#   $args[0] = 'event' (Owen on the event roster) or 'private' (Emma on the Private testing tab, Past)
$env:TKD_CDP_PORT = '9351'
$c = 'docs/Design Review/tools/cdp.mjs'
$d = 'docs/Testing/Color Belt Testing/Design Review mockups/pass2'
$where = $args[0]
# comment lines dropped: Windows PowerShell 5.1 mangles double quotes in arguments to node
$inject = (Get-Content "$d/inject-m03.js" | Where-Object { $_ -notmatch '^\s*//' }) -join ' '
$name = if ($where -eq 'private') { 'Emma Ross' } else { 'Owen Reed' }
$sizes = @(@('1280', '800', '', 'pc'), @('820', '1180', 'touch', 'w820'), @('390', '844', 'touch', 'w390'), @('320', '640', 'touch', 'w320'))
function Open-Page {
  if ($where -eq 'private') {
    node $c eval "location.hash='#testing/color-belt'; 'ok'" | Out-Null
    Start-Sleep 1
    node $c click 'Private testing' | Out-Null
    Start-Sleep 1
    node $c click 'Past 2' | Out-Null
  } else {
    node $c eval "location.hash='#testing/color-belt/event/000001e0-0000-4000-8000-000000000001'; 'ok'" | Out-Null
  }
  node $c wait $name 6000 | Out-Null
  # the row into the middle of the screen, so its menu has room
  node $c eval "(() => { const b=document.querySelector('[aria-label=\'More actions for $name\']'); b.scrollIntoView({ block: 'center' }); return 'ok'; })()" | Out-Null
}
function Open-Menu {
  # a mouse click on the page's title closes any menu without switching to keyboard mode
  node $c clicksel 'h1' | Out-Null
  node $c click "More actions for $name" | Out-Null
  Start-Sleep 1
  node $c move 5 300 | Out-Null
}
foreach ($s in $sizes) {
  if ($s[2]) { node $c size $s[0] $s[1] $s[2] | Out-Null } else { node $c size $s[0] $s[1] | Out-Null }
  Start-Sleep 2
  if ((node $c eval "!!document.querySelector('.pin-input')") -eq 'true') { node $c type '.pin-input' '2580' | Out-Null; Start-Sleep 2 }
  Open-Page
  Open-Menu
  node $c shot "$d/m03-$($s[3])-$where-today.png" | Out-Null
  node $c rects '[role=menu]'
  node $c eval "window.__m03='admin'; 'ok'" | Out-Null
  node $c eval $inject
  node $c shot "$d/m03-$($s[3])-$where-admin.png" | Out-Null
  node $c rects '[role=menu]'
  Open-Menu
  node $c eval "window.__m03='staff'; 'ok'" | Out-Null
  node $c eval $inject
  node $c shot "$d/m03-$($s[3])-$where-staffA.png" | Out-Null
  node $c rects '[role=menu]'
  node $c clicksel 'h1' | Out-Null
  node $c reload | Out-Null
  Start-Sleep 2
  if ((node $c eval "!!document.querySelector('.pin-input')") -eq 'true') { node $c type '.pin-input' '2580' | Out-Null; Start-Sleep 2 }
  Write-Output "shot $($s[3]) $where"
}
node $c size 1280 800 | Out-Null
