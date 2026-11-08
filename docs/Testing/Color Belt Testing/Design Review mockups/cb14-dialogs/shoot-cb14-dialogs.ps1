# shoot-cb14-dialogs.ps1 - the dialog sheet for CB14 (rulebook v0.427, build plan step 1): every dialog the split
# changes, made from the REAL dialog in the preview (fields taken out, retitled, amber / green boxes).
# Run from the worktree root with the preview on 5191 and the screenshot browser (TKD_CDP_PORT 9351) running.
# $args[0] = 'pc' (1280x800) or 'phone' (390x844 touch). Nothing here is part of the app: the "after" dialogs are
# the real ones with parts removed.
$env:TKD_CDP_PORT = '9351'
$c = 'docs/Design Review/tools/cdp.mjs'
$d = 'docs/Testing/Color Belt Testing/Design Review mockups/cb14-dialogs'
$size = if ($args[0]) { $args[0] } else { 'pc' }
$utf8 = [System.Text.Encoding]::UTF8
function Js([string]$code) { return node $c eval $code }
function Pin { if ((node $c eval "!!document.querySelector('.pin-input')") -eq 'true') { node $c type '.pin-input' '2580' | Out-Null; Start-Sleep 2 } }
function OpenClasses {
  node $c eval "__tkdPreview.resetTesting(); __tkdPreview.setRole('admin'); location.hash='#testing/color-belt'; 'ok'" | Out-Null
  node $c reload | Out-Null; Start-Sleep 3; Pin
  node $c click 'Classes and ranks' | Out-Null; Start-Sleep 1
  node $c eval "(() => { const t = document.querySelector('main .ctoggle'); if (t && t.getAttribute('aria-expanded') === 'false') t.click(); return 'open'; })()" | Out-Null
  Js ([System.IO.File]::ReadAllText("$d/lib.js", $utf8)) | Out-Null
}
# open one dialog by its button's label, (type a name), run the edit script, shoot, clear the boxes, start fresh
function Variant([string]$name, [string]$button, [string]$code, [string]$typeName = '') {
  node $c click $button | Out-Null; Start-Sleep 1.5
  if ($typeName) {
    $typed = $false
    foreach ($try in 1..3) { node $c type '[role=dialog] input.input' $typeName 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { $typed = $true; break }; Start-Sleep 1 }
    if (-not $typed) { Write-Output "WARNING: could not type the name for $name" }
    Start-Sleep 1
  }
  if ($code) { $r = Js $code; if ("$r" -match 'Error') { Write-Output "WARNING $name : $r" } }
  node $c move 5 5 | Out-Null
  node $c shot "$d/$name-$size.png" | Out-Null
  Write-Output "shot $name-$size"
  OpenClasses   # a dialog the person typed in will not close on Escape, so every variant starts from a fresh page
}
# Phone dialogs are long pages with a fixed Save bar: a TALL window (390 x 1500) shows the whole page without scrolling.
if ($size -eq 'phone') { node $c size 390 1500 touch | Out-Null } else { node $c size 1280 800 | Out-Null }
node $c open 'http://localhost:5191/' | Out-Null; Start-Sleep 3; Pin
OpenClasses

$amber = "'#f59e0b'"; $green = "'#16a34a'"
$removeFirst = "const m = __m, d = m.dlg();"
Variant 'edit-rank-today' 'Edit LT Yellow' "(() => { __m.box(__m.pricesParts(true), $amber); return 'ok'; })()"
Variant 'edit-rank-after' 'Edit LT Yellow' "(() => { __m.pricesParts().forEach((e) => e && e.remove()); return 'ok'; })()"
Variant 'edit-prices-after' 'Edit LT Yellow' "(() => { $removeFirst const f = m.fieldOf('Rank name'); if (f) f.remove(); const r = m.roOf('Testing for'); if (r) r.remove(); const b = d.querySelector('.rank-belt'); if (b) b.remove(); d.querySelectorAll('.rank-col:empty').forEach((e) => e.remove()); d.querySelectorAll('.tdialog-divider').forEach((e) => e.remove()); const pl = m.byText('p.ro-label.tdialog-group', 'Prices'); if (pl) pl.remove(); const rc = d.querySelector('.rank-cols'); if (rc) rc.style.display = 'block'; m.title('Edit prices'); const dot = String.fromCharCode(183); m.sub('LT Yellow ' + dot + ' Little Tiger ' + dot + ' Worcester'); m.narrow(480); if (d.classList.contains('dialog')) m.box([d], $green, 4); return 'ok'; })()"
Variant 'add-rank-A' 'Add rank' $null 'LT Brown'
Variant 'add-rank-B' 'Add rank' "(() => { $removeFirst m.pricesParts().forEach((e) => e && e.remove()); const ro = m.roOf('Testing for'); const p = document.createElement('p'); p.className = 'field-hint tdialog-copied'; p.textContent = 'It starts with the prices of LT Black, the rank above. Change them on the Prices tab.'; ro.insertAdjacentElement('afterend', p); m.box([p], $green); return 'ok'; })()" 'LT Brown'
Variant 'edit-class-today' 'Edit class Little Tiger' "(() => { __m.box([__m.dlg().querySelector('form > div:nth-child(2)')], $amber); return 'ok'; })()"
Variant 'edit-class-after' 'Edit class Little Tiger' "(() => { __m.dlg().querySelector('form > div:nth-child(2)').remove(); return 'ok'; })()"
Variant 'final-award-after' 'Edit class Little Tiger' "(() => { $removeFirst d.querySelector('form > div.field').remove(); m.title('Final award'); if (d.classList.contains('dialog')) m.box([d], $green, 4); return 'ok'; })()"
if ($size -eq 'phone') { node $c size 1280 800 | Out-Null }
