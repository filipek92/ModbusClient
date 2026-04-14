# Modbus Client – Dokumentace

Modbus Client je desktopová aplikace postavená na Electronu, Vue 3 a Quasaru, určená pro komunikaci se zařízeními přes protokol **Modbus TCP** nebo **Modbus RTU**. Umožňuje čtení i zápis registrů, automatický pravidelný sběr hodnot a správu popisů zařízení (dekoderů).

---

## Části aplikace

### Připojení (Connection Settings)

Panel pro konfiguraci spojení. Podporuje dva režimy:

- **TCP** – zadej IP adresu a port (výchozí 502). Historie naposledy zadaných adres se ukládá lokálně.
- **RTU** – sériová linka, nastavení: cesta k zařízení (např. `/dev/ttyUSB0`), baud rate, parita, datové bity, stop bity.

Po kliknutí na **Connect** se aplikace pokusí navázat spojení. Stav a statistiky (TX/RX bajty) jsou zobrazeny pod tlačítkem.

---

### Ruční dotaz (Manual Query)

Umožňuje jednorázové čtení nebo zápis do konkrétní adresy registru.

**Typy registrů:**
| Typ | Popis | Přístup |
|---|---|---|
| `holding` | Holding Registers (16bit) | Čtení i zápis |
| `input` | Input Registers (16bit) | Jen čtení |
| `coil` | Coil (1bit boolean) | Čtení i zápis |
| `discrete` | Discrete Input (1bit boolean) | Jen čtení |

Parametry dotazu:
- **Slave ID** – adresa zařízení na sběrnici (1–247)
- **Start Address** – adresa prvního registru (0-based)
- **Length** – počet registrů k načtení

Zápis podporuje zápis jedné nebo více hodnot (oddělených čárkou) a strategii `single` (funkce 06/05) nebo `multiple` (funkce 16/15).

---

### Pravidelné kolektory (Regular Collectors)

Każý kolektor opakovaně (v nastaveném intervalu) čte registr(y) a zobrazuje výsledek. Výsledek lze transformovat pomocí JavaScript výrazu v poli **JS Conversion** (funkce s `value[]` polem načtených registrů).

Příklad JS konverze:
```js
// Napětí v desetinách voltů → volty
return value[0] * 0.1;
```

---

### Správa zařízení (Device Manager)

Modul pro správu aktivních zařízení popsaných **dekodéry** (viz [Device Decoder Format](./device-decoder-format.md)). Každé zařízení:

- Odkazuje na šablonu dekodéru (JSON soubor s popisem registrů)
- Má vlastní **Slave ID** a **interval** dotazování
- Čte všechna definovaná pole a zobrazuje je jako pojmenované hodnoty s jednotkami

Dekodéry lze:
- Importovat z JSON souboru (**Import JSON**)
- Stáhnout jako balíček z URL (**Download Pack**)
- Vytvořit nebo editovat přímo v aplikaci (**New / Edit**)
- Exportovat zpět jako JSON

---

### Scanner (Value Scanner)

Nástroj pro prohledávání registrů. Prochází rozsah adres a hledá konkrétní hodnotu (nebo skenuje přítomná zařízení podle Slave ID). Pomáhá při prvotním průzkumu neznámého zařízení.

---

### Log konzole (Log Console)

Zobrazuje časovaný log všech Modbus operací – je užitečná pro ladění komunikace a diagnostiku chyb.

---

## Formát popisu zařízení

Zařízení se popisují JSON soubory – **dekodéry**. Viz podrobný návod v [device-decoder-format.md](./device-decoder-format.md).

---

## Automatické aktualizace

Aplikace obsahuje integrovaný systém automatických aktualizací přes `electron-updater`.
- Aplikace při spuštění automaticky kontroluje novější verzi na platformě GitHub.
- V případě dostupnosti nové verze je uživatel upozorněn vizuální notifikací s možností aktualizaci stáhnout.
- Jakmile je nová verze stažena, je nabídnuta instalace s následným restartem do nové verze.

---

## Technické poznámky

- Komunikace renderer ↔ main probíhá přes Electron IPC (`contextBridge`).
- Dekodéry jsou uloženy v adresáři uživatelských dat (`userData`). Výchozí dekodéry jsou zabaleny přímo v aplikaci.
- Aplikace ukládá historii IP adres do `localStorage`.
