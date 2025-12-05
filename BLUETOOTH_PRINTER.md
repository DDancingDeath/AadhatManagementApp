# Bluetooth Printer Integration

## Overview
The app now supports direct Bluetooth printing to 80mm thermal printers using ESC/POS commands. This is ideal for mobile point-of-sale operations.

## Features

### 1. **Automatic Print Method Selection**
- If Bluetooth printer is enabled and connected → prints via Bluetooth
- If Bluetooth fails or not configured → falls back to web print dialog
- Seamless user experience with error handling

### 2. **ESC/POS Command Generation**
- Supports standard 80mm thermal printers (48 characters per line)
- Formatted receipts with proper alignment and text sizing
- Includes:
  - Centered title (double size)
  - Date/time stamp
  - Item-wise details with rates and quantities
  - Weight breakdowns for multiple packets
  - Labor charges (for purchases)
  - Payment details (online/cash)
  - Auto paper cut command

### 3. **Device Management**
- Scan for nearby Bluetooth devices
- Connect to thermal printers
- Persistent connection settings
- Connection status indicator
- Test print functionality

## Setup Instructions

### For Development/Testing

1. **Install Plugin** (Already done)
   ```bash
   npm install @capacitor-community/bluetooth-le
   npx cap sync
   ```

2. **Android Permissions** (Already added to AndroidManifest.xml)
   - BLUETOOTH_SCAN
   - BLUETOOTH_CONNECT
   - ACCESS_FINE_LOCATION (required for Bluetooth on Android)

3. **Test in Mobile App**
   - Build and run on Android device
   - Go to Settings → Bluetooth Printer
   - Enable Bluetooth Printing
   - Scan for devices
   - Connect to your thermal printer

### For Production

1. **Build APK**
   ```bash
   npx cap sync
   cd android
   ./gradlew assembleRelease
   ```

2. **Test Bluetooth Printer**
   - Ensure printer is powered on and in pairing mode
   - Connect via app settings
   - Use "Test Print" to verify connection
   - Print actual bills to confirm formatting

## Usage Guide

### Connecting to Printer

1. Navigate to **Settings** tab
2. Enable **"Enable Bluetooth Printing"** checkbox
3. Click **"Scan for Printers"** button
4. Select your thermal printer from the list
5. Click **"Connect"**
6. Status will show "Connected to [Printer Name]"

### Printing Bills

- Once connected, all prints via "Print Purchase" or "Print Sale" buttons will automatically use Bluetooth
- If Bluetooth print fails, you'll get option to use web print instead
- Web print still available as fallback

### Test Print

- Click **"Test Print"** button in Settings
- Sends a sample bill to printer to verify:
  - Connection is working
  - Formatting is correct
  - Paper width is appropriate

### Disconnecting

- Click **"Disconnect Printer"** button
- Printer can be reconnected later without re-scanning

## Technical Details

### ESC/POS Commands Used

| Command | Purpose |
|---------|---------|
| `ESC @` | Initialize printer |
| `ESC a 0/1` | Left/center alignment |
| `ESC ! 0x30` | Double height + width text |
| `ESC ! 0x18` | Bold + double height |
| `ESC ! 0x00` | Normal text size |
| `GS V A 3` | Partial paper cut |

### Receipt Format

```
प्याज (40 वजन)
10.0 10.0 10.0 10.0 10.0 10.0
10.0 10.0 10.0 10.0 10.0 10.0
10.0 10.0 10.0 10.0 10.0 10.0
10.0 10.0 10.0 10.0 10.0 10.0
10.0 10.0 10.0 10.0 10.0 10.0
10.0 10.0 10.0 10.0

              Receipt
      27/11/2025, 10:30 AM
────────────────────────────
वस्तु        दर     मात्रा      कुल
────────────────────────────
प्याज       ₹50     400kg     ₹20000
टमाटर      ₹60      15kg      ₹900
────────────────────────────
कुल                          ₹20900
मज़दूरी         6 × 2 =       ₹12
────────────────────────────
       कुल भुगतान: ₹20912

           धन्यवाद!
```

**Format Details:**
- **Weights first**: Multiple weights listed at the top (6 per line) with Hindi item name
- **Receipt header**: Centered "Receipt" with date/time
- **Box drawing separators**: Using ─ character for cleaner look
- **Item table**: Hindi headers (वस्तु, दर, मात्रा, कुल)
- **Summary only**: Item rows show totals only, weights already shown above
- **Single weights**: No weight breakdown, just item summary
- **Hindi labels**: All labels in Devanagari (कुल, मज़दूरी, धन्यवाद)
- **Bold grand total**: कुल भुगतान centered and bold
- **Bitmap rendering**: Uses canvas for proper Hindi font rendering

### Bluetooth Plugin Details

- **Plugin**: @capacitor-community/bluetooth-le
- **Version**: 7.2.0
- **Platform**: Android (Bluetooth LE)
- **Service UUIDs**: Automatically detects common thermal printer services
- **Characteristic**: Automatically finds writable characteristics

### Error Handling

1. **Plugin Not Available** (Web browser)
   - Shows modal: "Bluetooth is only available in mobile app"
   - Falls back to web print

2. **No Devices Found**
   - Shows message: "No devices found. Make sure printer is on and in pairing mode"

3. **Connection Failed**
   - Shows error message with reason
   - Allows retry or fallback to web print

4. **Print Failed**
   - Shows error modal
   - Offers web print as alternative
   - Maintains bill data for retry

## Supported Printers

### Tested
- Generic 80mm ESC/POS thermal printers
- Most Android-compatible Bluetooth thermal printers

### Compatible Brands (Likely to work)
- Epson TM series (with Devanagari support for Hindi)
- Star Micronics
- Zebra mobile printers
- GOOJPRT portable printers
- Xprinter XP-P300
- Any ESC/POS compatible 80mm printer with Bluetooth

**For Hindi Support**: Look for printers with:
- Devanagari font support
- Multi-language capability
- Indian market models (often support regional languages)

### Requirements
- Bluetooth Low Energy (BLE) support
- ESC/POS command set
- 80mm paper width (48 characters per line)
- Android 5.0+ device

## Troubleshooting

### Printer Not Found During Scan
1. Ensure printer is powered on
2. Put printer in pairing mode (check printer manual)
3. Check if printer is already connected to another device
4. Try restarting the printer

### Connection Fails
1. Ensure location permission is granted (required for Bluetooth)
2. Check if printer is within range (typically 10 meters)
3. Restart printer and try again
4. Check printer battery if portable

### Prints Garbled Text
1. Verify printer supports ESC/POS commands
2. Check paper width settings (should be 80mm)
3. Try test print to verify formatting
4. Some printers may need specific initialization

### Nothing Prints
1. Check printer has paper loaded
2. Verify printer is not in error state (out of paper, cover open, etc.)
3. Use test print to verify connection
4. Check printer Bluetooth LED is active

### Hindi Characters Show as Boxes/Garbled
- Most ESC/POS thermal printers don't support Devanagari (Hindi) Unicode characters
- The printer firmware only supports ASCII and limited extended character sets
- Hindi text will appear as boxes (□) or question marks (?)
- **Solution**: Use a thermal printer that explicitly supports Hindi/Devanagari fonts
- **Alternative**: Use English item names for Bluetooth receipts
- Web print (browser print dialog) fully supports Hindi on any printer

## Future Enhancements

### Possible Additions
1. **QR Code Support** - Add QR codes to receipts for bill lookup
2. **Logo Printing** - Add business logo at top of receipt
3. **Custom Paper Width** - Support for 58mm printers
4. **Print Templates** - Multiple receipt formats
5. **Auto-reconnect** - Reconnect to last used printer on app start
6. **Multiple Printers** - Support switching between multiple printers
7. **Print Preview** - Show receipt preview before printing

### Configuration Options
- Receipt footer customization
- Business name/address on receipt
- Receipt language selection
- Font size adjustment
- Print density control

## Web Print vs Bluetooth Print

| Feature | Web Print | Bluetooth Print |
|---------|-----------|-----------------|
| Platform | All (web + mobile) | Mobile app only |
| Printer Type | Any USB/Network | Bluetooth thermal |
| Hindi Support | ✓ Full | Limited |
| Speed | Slower (dialog) | Fast (direct) |
| Paper Size | A4/Letter | 80mm thermal |
| Auto-cut | No | Yes |
| Setup | None | One-time pairing |
| Cost | Any printer | Thermal printer (~₹5000-15000) |

## Recommended Workflow

1. **Setup Phase**
   - Connect Bluetooth printer once
   - Test print to verify
   - Keep web print as backup

2. **Daily Operations**
   - All prints automatically use Bluetooth
   - Fast, silent printing
   - Auto paper cut
   - No printer dialogs

3. **Backup Option**
   - If Bluetooth fails, use web print
   - Regular printer for reports/backup
   - A4 print for detailed records

## Notes

- Bluetooth printing requires Android device with BLE support
- Web browser version always uses web print dialog
- Printer connection persists across app restarts
- Battery-powered printers need charging regularly
- Thermal paper fades over time (store important receipts digitally)
