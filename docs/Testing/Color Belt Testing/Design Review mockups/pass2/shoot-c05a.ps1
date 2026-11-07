# shoot-c05a.ps1: pass 2 C-05 (a)'s shots. A new event with nobody registered, today (four zero cards)
# and after (no cards until someone registers, as the Private testing tab, Star and Camps do), at the four
# review sizes. Run from the worktree root with the preview on 5191, the screenshot browser on 9351,
# signed in as admin and on the empty event's page. The After is drawn by hiding .ev-cards (mockup only).
$env:TKD_CDP_PORT = '9351'
$c = 'docs/Design Review/tools/cdp.mjs'
$d = 'docs/Testing/Color Belt Testing/Design Review mockups/pass2'
$sizes = @(@('1280', '800', '', 'pc'), @('820', '1180', 'touch', 'w820'), @('390', '844', 'touch', 'w390'), @('320', '640', 'touch', 'w320'))
foreach ($s in $sizes) {
  if ($s[2]) { node $c size $s[0] $s[1] $s[2] | Out-Null } else { node $c size $s[0] $s[1] | Out-Null }
  Start-Sleep 2
  if ((node $c eval "!!document.querySelector('.pin-input')") -eq 'true') { node $c type '.pin-input' '2580' | Out-Null; Start-Sleep 2 }
  node $c wait 'Payments recorded' 6000 | Out-Null
  node $c eval 'window.scrollTo(0,0)' | Out-Null
  node $c shot "$d/c05a-$($s[3])-today.png" | Out-Null
  node $c rects '.ev-cards'
  node $c eval "document.querySelector('.ev-cards').style.display='none'; 'hidden'" | Out-Null
  node $c shot "$d/c05a-$($s[3])-after.png" | Out-Null
  node $c reload | Out-Null
  Start-Sleep 2
  if ((node $c eval "!!document.querySelector('.pin-input')") -eq 'true') { node $c type '.pin-input' '2580' | Out-Null; Start-Sleep 2 }
  Write-Output "shot $($s[3])"
}
node $c size 1280 800 | Out-Null
