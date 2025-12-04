# Git Repository Structure Guide

## ✅ Files/Folders to KEEP in GitHub

### Root Configuration Files
```
✅ .firebaserc                    # Firebase project config
✅ .gitignore                     # Git ignore rules
✅ capacitor.config.json          # Capacitor configuration
✅ firebase.json                  # Firebase hosting config
✅ package.json                   # NPM dependencies
✅ package-lock.json              # NPM lock file
✅ README.md                      # Project documentation
```

### Documentation Files
```
✅ BLUETOOTH_PRINTER.md
✅ FIREBASE_SETUP_COMPLETE.md
✅ IMPLEMENTATION_PLAN.md
✅ MOBILE_ENHANCEMENTS.md
```

### Source Code - www/ Directory
```
✅ www/
   ✅ index.html                  # Main HTML file
   ✅ styles.css                  # Styles
   ✅ firebaseConfig.js           # Firebase config (⚠️ see note below)
   ✅ script.js                   # Legacy script (temporary)
   ✅ js/                         # Modular code
      ✅ utils/
         ✅ constants.js
         ✅ state.js
         ✅ helpers.js
      ✅ ui/
         ✅ ui-manager.js
         ✅ navigation.js
      ✅ auth/
         ✅ authentication.js
      ✅ firebase/
         ✅ firestore-service.js
      ✅ modules/
         ✅ items.js
         ✅ billing.js (when created)
         ✅ sales.js (when created)
         ✅ stock.js (when created)
         ✅ payments.js (when created)
         ✅ reports.js (when created)
         ✅ finance.js (when created)
         ✅ users.js (when created)
      ✅ services/
         ✅ printer.js
      ✅ main.js
      ✅ README.md                # Module documentation
      ✅ *.md                     # All documentation files
```

### Android Source (If using Capacitor)
```
✅ android/
   ✅ build.gradle
   ✅ capacitor.settings.gradle
   ✅ gradle.properties
   ✅ gradlew
   ✅ gradlew.bat
   ✅ settings.gradle
   ✅ variables.gradle
   ✅ app/
      ✅ build.gradle
      ✅ capacitor.build.gradle
      ✅ proguard-rules.pro
      ✅ src/                     # Android source code
   ✅ capacitor-cordova-android-plugins/
      ✅ build.gradle
      ✅ cordova.variables.gradle
      ✅ src/
   ✅ gradle/
      ✅ wrapper/
```

### Public Directory (Firebase Hosting)
```
✅ public/
   ✅ index.html                  # Firebase welcome page (optional)
```

## ❌ Files/Folders to EXCLUDE from GitHub (Already in .gitignore)

### Build & Generated Files
```
❌ node_modules/                 # NPM packages (recreated by npm install)
❌ android/build/                # Android build output
❌ android/app/build/            # App build output
❌ android/app/release/          # Release APKs
❌ android/.gradle/              # Gradle cache
❌ android/capacitor-cordova-android-plugins/build/
❌ dist/                         # Distribution files
❌ build/                        # Build output
```

### Generated & Temporary Files
```
❌ .firebase/                    # Firebase cache
❌ *.log                         # Log files
❌ *.apk                         # Android APK files
❌ *.aab                         # Android App Bundle
❌ *.tmp                         # Temporary files
❌ *.bak                         # Backup files
❌ page2.html                    # Temporary test file
```

### IDE & System Files
```
❌ .vscode/                      # VS Code settings (personal)
❌ .idea/                        # IntelliJ IDEA settings
❌ .DS_Store                     # macOS files
❌ Thumbs.db                     # Windows files
❌ *.swp, *.swo                  # Vim swap files
```

### Sensitive Files
```
❌ android/local.properties      # Local Android SDK paths
❌ .env                          # Environment variables
```

## ⚠️ Special Consideration: firebaseConfig.js

**Option 1: Keep in Git (For Team Projects)**
- ✅ If your Firebase project uses security rules
- ✅ If API keys are restricted by domain/app
- ✅ If it's a private repository
- ✅ Easier for team collaboration

**Option 2: Exclude from Git (For Public Repos)**
- ❌ Add to .gitignore if repo is public
- ❌ Provide `firebaseConfig.example.js` instead
- ❌ Document setup in README

**Current Status**: ✅ Included (recommended for private repos)

## 📝 Sample Data Files

```
⚠️ items_import.csv              # Sample data (optional)
```
- Keep if it's example/template data
- Exclude if it contains real user data

## 🔍 Quick Check Command

Run this in your project root to see what will be committed:

```bash
git status
git ls-files
```

To see what's ignored:
```bash
git status --ignored
```

## 📦 Repository Size

### Current Structure (Approximate)
```
Source Code:      ~500 KB
Documentation:    ~100 KB
Dependencies:     Excluded (node_modules ignored)
Android Build:    Excluded (build folders ignored)

Total in Git:     ~600 KB (very manageable)
```

## 🚀 Initial Git Commands

If starting fresh:

```bash
# Initialize (if not done)
git init

# Add all files (respecting .gitignore)
git add .

# Commit
git commit -m "Initial commit: Modular ES6 architecture"

# Add remote (GitHub)
git remote add origin https://github.com/YOUR_USERNAME/AadhatManagementApp.git

# Push
git push -u origin main
```

## 📋 Recommended .gitignore Sections

Your `.gitignore` now includes:
- ✅ Node.js dependencies
- ✅ Firebase cache
- ✅ Android build files
- ✅ IDE settings
- ✅ OS files
- ✅ Temporary files
- ✅ Build outputs

## 🎯 Summary

**KEEP (Commit to Git):**
- Source code (www/js/, www/*.html, www/*.css, www/*.js)
- Configuration files (package.json, firebase.json, etc.)
- Documentation (*.md files)
- Android source files (not build outputs)

**EXCLUDE (Don't commit):**
- node_modules/
- Build outputs (android/build/, *.apk, *.aab)
- Generated files (.firebase/, logs)
- IDE/OS files (.vscode/, .DS_Store)
- Local configs (android/local.properties)

Your `.gitignore` is now properly configured! ✅
