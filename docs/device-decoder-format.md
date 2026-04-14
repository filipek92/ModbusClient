# Formát popisu zařízení (Device Decoder)

Tento dokument popisuje strukturu JSON souboru, který definuje, jak aplikace Modbus Client čte a zobrazuje hodnoty z konkrétního zařízení. Soubor se nazývá **dekodér** (device decoder).

Dekodér je prostý JSON soubor, který lze:
- Importovat přes tlačítko **Import JSON** v záložce Devices
- Sdílet nebo verovat v balíčku přes **Download Pack**
- Vytvořit ručně a uložit přes editor v aplikaci

---

## Základní struktura

```json
{
  "id": "my-device-v1",
  "name": "My Device v1.0",
  "defaultSlaveId": 1,
  "fields": [ ... ]
}
```

### Pole nejvyšší úrovně

| Pole | Typ | Povinné | Popis |
|---|---|---|---|
| `id` | `string` | ✅ | Unikátní identifikátor dekodéru (bez mezer, bez diakritiky, doporučeno kebab-case) |
| `name` | `string` | ✅ | Zobrazovaný název zařízení v aplikaci |
| `defaultSlaveId` | `number` | ✅ | Výchozí Slave ID na Modbus sběrnici (1–247). Lze přepsat při přidávání zařízení. |
| `fields` | `array` | ✅ | Seznam registrů / polí ke čtení (viz níže) |

---

## Popis pole (DecoderField)

Každý prvek v poli `fields` popisuje jeden nebo více registrů k přečtení a způsob jejich dekódování.

```json
{
  "address": 0,
  "type": "input",
  "name": "Voltage",
  "dataType": "uint16",
  "unit": "V",
  "scale": 0.1,
  "precision": 1
}
```

### Vlastnosti pole

| Vlastnost | Typ | Povinné | Popis |
|---|---|---|---|
| `address` | `number` | ✅ | Adresa registru (0-based). U 32-bitových typů designuje první registr (nižší adresa). |
| `type` | `string` | ✅ | Typ registru: `"holding"`, `"input"`, `"coil"`, `"discrete"` |
| `name` | `string` | ✅ | Název hodnoty zobrazovaný v aplikaci |
| `dataType` | `string` | ✅ | Datový typ: `"uint16"`, `"int16"`, `"uint32"`, `"int32"`, `"float32"`, `"boolean"` |
| `unit` | `string` | – | Jednotka zobrazená za hodnotou (např. `"V"`, `"°C"`, `"%"`) |
| `scale` | `number` | – | Multiplikátor: surová hodnota × scale = výsledek. Výchozí: `1` |
| `precision` | `number` | – | Počet desetinných míst při zobrazení. Výchozí: `0` |
| `wordOrder` | `string` | – | Pořadí slov u 32-bitových typů: `"big-endian"` (High–Low, výchozí) nebo `"little-endian"` (Low–High) |
| `transform` | `string` | – | Tělo JavaScript funkce pro vlastní transformaci. Proměnná `value` obsahuje hodnotu po aplikaci `scale`. Funkce musí obsahovat `return`. |
| `map` | `object` | – | Mapování číselné hodnoty na řetězec (enum). Klíče jsou čísla jako řetězce. |

---

## Datové typy

| `dataType` | Délka | Znaménko | Popis |
|---|---|---|---|
| `uint16` | 1 registr | bez znaménka | 0–65535 |
| `int16` | 1 registr | se znaménkem | –32768–32767 |
| `uint32` | 2 registry | bez znaménka | 0–4294967295 |
| `int32` | 2 registry | se znaménkem | –2147483648–2147483647 |
| `float32` | 2 registry | IEEE 754 plovoucí | Desetinná čísla |
| `boolean` | 1 coil/discrete | – | true/false (použij s `type: "coil"` nebo `"discrete"`) |

> **32-bitové typy** vždy čtou 2 po sobě jdoucí registry. Pořadí slov (High–Low nebo Low–High) se nastavuje pomocí `wordOrder`.

---

## Typy registrů

| `type` | Modbus funkce (čtení) | Popis | Zápis |
|---|---|---|---|
| `holding` | FC 03 | Holding registers – universální R/W registry | ✅ |
| `input` | FC 04 | Input registers – měřené hodnoty (jen čtení) | ❌ |
| `coil` | FC 01 | Digitální výstup (boolean) | ✅ |
| `discrete` | FC 02 | Digitální vstup (boolean, jen čtení) | ❌ |

---

## Vlastnosti a příklady

### Jednoduchá hodnota (uint16 s přepočtem)

```json
{
  "address": 0,
  "type": "input",
  "name": "Voltage",
  "dataType": "uint16",
  "unit": "V",
  "scale": 0.1,
  "precision": 1
}
```

Zařízení vrací hodnotu `2315` → aplikace zobrazí `231.5 V`.

---

### 32-bitová hodnota s little-endian pořadím slov

```json
{
  "address": 1,
  "type": "input",
  "name": "Current",
  "dataType": "uint32",
  "unit": "A",
  "scale": 0.001,
  "precision": 3,
  "wordOrder": "little-endian"
}
```

Čte registry na adresách 1 a 2. Pořadí Low-High (typické např. pro PZEM-004T).

---

### Enum / mapa hodnot

```json
{
  "address": 9,
  "type": "input",
  "name": "Run Mode",
  "dataType": "uint16",
  "map": {
    "0": "Waiting",
    "1": "Checking",
    "2": "Normal",
    "3": "Fault",
    "4": "Permanent Fault"
  }
}
```

Hodnota `2` se zobrazí jako `"Normal"`.

---

### Vlastní transformace (transform)

`transform` je tělo JS funkce. K dispozici je proměnná `value` (číslo po aplikaci `scale`).

```json
{
  "address": 5,
  "type": "input",
  "name": "Energy",
  "dataType": "uint32",
  "unit": "Wh",
  "scale": 1,
  "precision": 0,
  "transform": "return value > 1000 ? (value / 1000).toFixed(2) + ' kWh' : value + ' Wh';"
}
```

```json
{
  "address": 65,
  "type": "holding",
  "name": "Charge Period Start",
  "dataType": "uint16",
  "transform": "return Math.floor(value / 256) + ':' + (value % 256).toString().padStart(2, '0');"
}
```

> **Pozor:** `transform` potlačuje `unit` a `precision` – výstup tvoří plně transformační funkce.

---

### Float32

```json
{
  "address": 100,
  "type": "input",
  "name": "Temperature",
  "dataType": "float32",
  "unit": "°C",
  "precision": 2
}
```

IEEE 754 float uložený ve 2 registrech. `wordOrder: "big-endian"` je výchozí (High word na nižší adrese).

---

## Kompletní příklad – jednoduchý měřič energie

```json
{
  "id": "my-energy-meter-v1",
  "name": "My Energy Meter v1.0",
  "defaultSlaveId": 1,
  "fields": [
    {
      "address": 0,
      "type": "input",
      "name": "Voltage",
      "dataType": "uint16",
      "unit": "V",
      "scale": 0.1,
      "precision": 1
    },
    {
      "address": 1,
      "type": "input",
      "name": "Current",
      "dataType": "uint32",
      "unit": "A",
      "scale": 0.001,
      "precision": 3,
      "wordOrder": "little-endian"
    },
    {
      "address": 3,
      "type": "input",
      "name": "Power",
      "dataType": "uint32",
      "unit": "W",
      "scale": 0.1,
      "precision": 1,
      "wordOrder": "little-endian"
    },
    {
      "address": 7,
      "type": "input",
      "name": "Frequency",
      "dataType": "uint16",
      "unit": "Hz",
      "scale": 0.1,
      "precision": 1
    },
    {
      "address": 9,
      "type": "input",
      "name": "Status",
      "dataType": "uint16",
      "map": {
        "0": "OK",
        "1": "Alarm"
      }
    }
  ]
}
```

---

## Pokyny pro AI generování dekodérů

Pokud generuješ dekodér na základě dokumentace k zařízení (datasheet, Modbus register map), dbej na:

1. **`id`** – unikátní, kebab-case, bez speciálních znaků. Doporučen formát: `{výrobce}-{model}-{verze}`, npr. `siemens-logo-8bm01`.
2. **`address`** – vždy 0-based. Pokud datasheet uvádí adresy jako `40001` (Modbus addressing), odečti `40001` pro holding nebo `30001` pro input → dostaneš 0-based adresu.
3. **32-bit hodnoty** – zkontroluj pořadí slov v datasheetu (High-Low = big-endian, Low-High = little-endian).
4. **`scale`** – pokud datasheet říká "hodnota / 10 = skutečná hodnota", pak `scale: 0.1`.
5. **`map`** – pro stavové registry vždy vypiš všechny hodnoty z datasheetu.
6. Nepoužívej `transform` tam, kde stačí `scale` + `precision` + `map`.
7. Ujisti se, že `id` je unikátní v rámci celé sady dekodérů.

### Adresní konvence

| Modbus adresa | Typ | 0-based adresa |
|---|---|---|
| 40001–49999 | holding | adresa − 40001 |
| 30001–39999 | input | adresa − 30001 |
| 00001–09999 | coil | adresa − 1 |
| 10001–19999 | discrete | adresa − 10001 |

Někteří výrobci indexují od 1 v datasheetu (tabulka začíná řádkem "1"), pak 0-based adresa = číslo z tabulky − 1.
