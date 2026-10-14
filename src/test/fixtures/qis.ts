/** A results page like QIS/HISinOne "Leistungen anzeigen" (Notenspiegel), shortened. */
export const QIS_RESULTS_HTML = `<!doctype html><html><body>
<table border="0" align="left" width="100%">
<tr>
  <th class="tabelle1_ueber">Prüfungsnr.</th><th class="tabelle1_ueber">Prüfungstext</th><th class="tabelle1_ueber">Semester</th>
  <th class="tabelle1_ueber">Note</th><th class="tabelle1_ueber">Status</th><th class="tabelle1_ueber">Credits</th>
  <th class="tabelle1_ueber">Vermerk</th><th class="tabelle1_ueber">Versuch</th><th class="tabelle1_ueber">Prüfungsdatum</th>
</tr>
<tr><td class="qis_konto" colspan="9">Grundlagen der Informatik</td></tr>
<tr><td class="tabelle1_alignleft">1010</td><td class="tabelle1_alignleft">Mathematik 1</td><td>WiSe 24/25</td><td>2,3</td><td>bestanden</td><td>5,0</td><td></td><td>1</td><td>03.02.2025</td></tr>
<tr><td>1020</td><td>Programmierung 1</td><td>WiSe 24/25</td><td>5,0</td><td>nicht bestanden</td><td>0,0</td><td></td><td>1</td><td>10.02.2025</td></tr>
<tr><td>1020</td><td>Programmierung 1</td><td>SoSe 25</td><td>1,7</td><td>bestanden</td><td>5,0</td><td></td><td>2</td><td>15.07.2025</td></tr>
<tr><td class="qis_konto" colspan="9">Vertiefung</td></tr>
<tr><td>2030</td><td>Datenbanken</td><td>SoSe 26</td><td></td><td>angemeldet</td><td></td><td></td><td>1</td><td></td></tr>
<tr><td>2040</td><td>Lineare Algebra</td><td>WiSe 25/26</td><td>1,3</td><td>BE</td><td>9,0</td><td></td><td>1</td><td>20.02.2026</td></tr>
</table>
<table><tr><th>Legende</th></tr><tr><td>BE = bestanden</td></tr></table>
</body></html>`

/**
 * Like HISinOne at a university with module rows: a sum row ("Gesamtkonto"), module rows above
 * their exams with fewer columns (status under "Note", credits under "Status"), several attempts.
 */
export const QIS_MODULES_HTML = `<!doctype html><html><body>
<table>
<tr><th>Prüfungsnr.</th><th>Prüfungstext</th><th>Semester</th><th>Note</th><th>Status</th><th>Credits</th><th>Vermerk</th><th>Versuch</th><th>Prüfungsdatum</th></tr>
<tr><td>10</td><td>Gesamtkonto</td><td>0</td><td></td><td>20</td></tr>
<tr><td>3010</td><td>Programmieren 1</td><td>WiSe 24/25</td><td>5,0</td><td>nicht bestanden</td><td>0</td><td></td><td>1</td><td>29.01.2025</td></tr>
<tr><td>3010</td><td>Programmieren 1</td><td>SoSe 25</td><td>3,3</td><td>bestanden</td><td>5</td><td></td><td>2</td><td>15.07.2025</td></tr>
<tr><td>3070</td><td>Programmieren 2</td><td>SoSe 25</td><td>5,0</td><td>nicht bestanden</td><td>0</td><td></td><td>1</td><td>21.08.2025</td></tr>
<tr><td>3070</td><td>Programmieren 2</td><td>WiSe 25/26</td><td>5,0</td><td>nicht bestanden</td><td>0</td><td></td><td>2</td><td>12.02.2026</td></tr>
<tr><td>3120</td><td>Mathematik 2</td><td>WiSe 25/26</td><td>1,3</td><td>bestanden</td><td>5</td><td></td><td>1</td><td>03.02.2026</td></tr>
<tr><td>3230</td><td>Bild und Ton</td><td>0</td><td>Prüfung vorhanden</td><td>0</td></tr>
<tr><td>3231</td><td>Bild und Ton</td><td>SoSe 26</td><td></td><td>nicht bestanden</td><td>0</td><td>nicht erschienen</td><td>1</td><td>27.08.2026</td></tr>
<tr><td>3350</td><td>Rechnerarchitektur</td><td>70</td><td>bestanden</td><td>5</td></tr>
<tr><td>3351</td><td>Rechnerarchitektur</td><td>SoSe 25</td><td></td><td>nicht bestanden</td><td>0</td><td>nicht erschienen</td><td>1</td><td>26.08.2025</td></tr>
<tr><td>3351</td><td>Rechnerarchitektur</td><td>WiSe 25/26</td><td>2,7</td><td>bestanden</td><td>0</td><td></td><td>2</td><td>05.02.2026</td></tr>
</table>
</body></html>`
