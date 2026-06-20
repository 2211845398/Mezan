/// Lightweight AR/EN strings. Replace with ARB/gen-l10n later if needed.
class AppStrings {
  AppStrings(this.localeCode);

  final String localeCode;

  bool get isArabic => localeCode.startsWith('ar');

  String t(String ar, String en) => isArabic ? ar : en;

  String get appName => t('ميزان', 'Mezan');

  String get navHome => t('الرئيسية', 'Home');
  String get navPayroll => t('الرواتب', 'Payroll');
  String get navMyLeaves => t('إجازاتي', 'My leaves');
  String get navRequests => t('المراسلات', 'Correspondence');
  String get navProfile => t('الملف', 'Profile');
  String get navStock => t('المخزون', 'Stock');

  String get loading => t('جاري التحميل...', 'Loading...');
  String get retry => t('إعادة المحاولة', 'Try again');
  String get emptyTitle => t('لا توجد بيانات', 'Nothing here yet');
  String get emptyBody =>
      t('سيظهر المحتوى هنا عند توفره.', 'Content will appear here when available.');
  String get errorTitle => t('حدث خطأ', 'Something went wrong');
  String get errorNetwork => t(
        'تحقق من الاتصال بالإنترنت ثم أعد المحاولة.',
        'Check your connection and try again.',
      );

  String get languageArabic => t('العربية', 'Arabic');
  String get languageEnglish => t('English', 'English');
  String get themeSystem => t('تلقائي', 'System');
  String get themeLight => t('فاتح', 'Light');
  String get themeDark => t('داكن', 'Dark');
  String get profileThemeMode => t('وضع المظهر', 'Theme mode');
  String get profileTwoFactorPasswordPrompt => t(
        'أدخل كلمة المرور الحالية لتأكيد تغيير المصادقة الثنائية',
        'Enter your current password to confirm the 2FA change',
      );
  String get profileTwoFactorConfirm => t('تأكيد', 'Confirm');
  String get profileTwoFactorCancel => t('إلغاء', 'Cancel');
  String get signOut => t('تسجيل الخروج', 'Sign out');

  String get kioskTitle =>
      t('امسح لتسجيل الحضور أو الانصراف', 'Scan to clock in / out');
  String kioskBranch(String name) => t('الفرع: $name', 'Branch: $name');
  String get kioskWaiting =>
      t('في انتظار توليد رمز الحضور…', 'Waiting for attendance code generation…');
  String get kioskQrReady =>
      t('الرمز جاهز للمسح', 'Code ready to scan');
  String get kioskGenerateQr =>
      t('توليد رمز الحضور', 'Generate attendance code');
  String get kioskQrExpired =>
      t('انتهت صلاحية الرمز', 'Code has expired');
  String get attendanceCheckInAction =>
      t('تسجيل حضور', 'Check in');
  String get attendanceCheckOutAction =>
      t('تسجيل انصراف', 'Check out');
  String get attendanceNoOpenCheckIn => t(
        'لا يمكن تسجيل الانصراف دون حضور مفتوح لهذا اليوم',
        'Cannot check out without an open check-in for today',
      );
  String get leaveRequestAction =>
      t('طلب إجازة', 'Request leave');

  String get loginTitle => t('تسجيل الدخول', 'Sign in');
  String get loginSubtitle =>
      t('ادخل بيانات حسابك في ميزان', 'Sign in to your Mezan account');
  String get loginEmail => t('البريد الإلكتروني', 'Email');
  String get loginPassword => t('كلمة المرور', 'Password');
  String get loginSubmit => t('دخول', 'Sign in');
  String get loginEmailRequired => t('أدخل البريد الإلكتروني', 'Enter your email');
  String get loginEmailInvalid => t('بريد غير صالح', 'Invalid email');
  String get loginPasswordRequired =>
      t('أدخل كلمة المرور', 'Enter your password');
  String get loginShowPassword => t('إظهار', 'Show');
  String get loginHidePassword => t('إخفاء', 'Hide');

  String get noEmployeeProfileTitle =>
      t('لا يوجد ملف موظف', 'No employee profile');
  String get noEmployeeProfileBody => t(
        'حسابك غير مربوط بملف موظف. تواصل مع الموارد البشرية.',
        'Your account is not linked to an employee profile. Contact HR.',
      );

  String greeting(String name) => t('مرحباً، $name', 'Hello, $name');

  String get todayAttendanceTitle =>
      t('حضور اليوم', "Today's Attendance");
  String get scanAttendanceTitle =>
      t('مسح QR للحضور', 'Scan attendance QR');
  String get scanAttendanceButton =>
      t('مسح QR للحضور', 'Scan Attendance QR');
  String scanAttendanceButtonFor({required bool clockOut}) => clockOut
      ? t('مسح QR للانصراف', 'Scan QR to clock out')
      : t('مسح QR للحضور', 'Scan QR to clock in');
  String get scanAttendanceRequestHint => t(
        'اطلب من جهاز الحضور عرض الرمز ثم امسحه',
        'Ask the attendance device to show the code, then scan it',
      );
  String get scanAttendanceHint => t(
        'وجّه الكاميرا نحو رمز الحضور في الفرع',
        'Point the camera at the branch attendance QR code',
      );
  String get attendanceStatusNotIn =>
      t('لم تسجّل الحضور بعد', 'Not checked in yet');
  String get attendanceStatusIn =>
      t('مسجّل حضور', 'Checked in');
  String get attendanceStatusDoneToday =>
      t('اكتمل دوام اليوم', 'Today completed');
  String get attendanceStatusOpen => t('وردية مفتوحة', 'Open shift');
  String get attendanceStatusDone => t('مكتمل', 'Completed');
  String get attendanceClockInSuccess =>
      t('تم تسجيل الحضور', 'Clock-in recorded');
  String get attendanceClockOutSuccess =>
      t('تم تسجيل الانصراف', 'Clock-out recorded');
  String attendanceSince(String time) =>
      t('منذ $time', 'Since $time');
  String get todaysShiftLabel =>
      t('وردية اليوم', "Today's shift");
  String get leaveBalanceLabel =>
      t('رصيد الإجازات', 'Leave balance');
  String get leaveDaysRemaining =>
      t('يوم متبقي', 'days left');
  String get lastAttendanceLabel =>
      t('آخر حضور', 'Last attendance');
  String get schedulePreviewTitle =>
      t('الجدول', 'Schedule');
  String get nextShiftLabel =>
      t('الوردية التالية', 'Next shift');
  String get dayOffLabel => t('إجازة', 'Day off');
  String get weekScheduleTitle => t('جدول الأسبوع', 'Weekly schedule');
  String get profileEditTitle => t('تعديل البيانات', 'Edit profile');
  String get profileEditSave => t('حفظ', 'Save');
  String get profileEditSaved => t('تم حفظ البيانات', 'Profile saved');
  String get profileFirstName => t('الاسم الأول', 'First name');
  String get profileFatherName => t('اسم الأب', 'Father name');
  String get profileFamilyName => t('اسم العائلة', 'Family name');
  String get profileEmail => t('البريد الإلكتروني', 'Email');
  String get profilePhone => t('الهاتف', 'Phone');
  String get profileCity => t('المدينة', 'City');
  String get profilePasswordSection => t('كلمة المرور', 'Password');
  String get profileCurrentPassword => t('كلمة المرور الحالية', 'Current password');
  String get profileNewPassword => t('كلمة المرور الجديدة', 'New password');
  String get profileConfirmPassword => t('تأكيد كلمة المرور', 'Confirm password');
  String get profileChangePassword => t('تغيير كلمة المرور', 'Change password');
  String get profilePhoneInvalid =>
      t('رقم هاتف ليبي غير صالح', 'Invalid Libyan mobile number');
  String get profileEmailInvalid => t('بريد غير صالح', 'Invalid email');
  String get profilePasswordMismatch =>
      t('كلمتا المرور غير متطابقتين', 'Passwords do not match');

  String get currencySymbol => t('د.ل', 'LYD');

  String get payrollCurrentMonthTitle =>
      t('صافي هذا الشهر', 'This month net pay');
  String get payrollNetLabel => t('صافي الراتب', 'Net pay');
  String get payrollEmptyTitle =>
      t('لا توجد كشوف رواتب', 'No payslips yet');
  String get payrollEmptyBody => t(
        'ستظهر كشوف الرواتب الشهرية هنا بعد إعدادها.',
        'Monthly payslips will appear here once payroll is prepared.',
      );
  String get payslipStatusDraft => t('مسودة', 'Draft');
  String get payslipStatusApproved => t('معتمد', 'Approved');
  String get payslipStatusPaid => t('مدفوع', 'Paid');
  String get payrollBaseSalary => t('الراتب الأساسي', 'Base salary');
  String get payrollOvertime => t('العمل الإضافي', 'Overtime');
  String get payrollBonus => t('المكافآت', 'Bonus');
  String get payrollAutomaticDeductions =>
      t('خصومات تلقائية', 'Automatic deductions');
  String get payrollManualDeductions =>
      t('خصومات يدوية', 'Manual deductions');
  String get payrollTotalDeductions =>
      t('إجمالي الخصومات', 'Total deductions');
  String get payrollPaidDate => t('تاريخ الدفع', 'Paid date');
  String get payrollDetailTitle => t('تفاصيل القسيمة', 'Payslip details');
  String get payrollDetailNotFoundTitle =>
      t('القسيمة غير متاحة', 'Payslip unavailable');
  String get payrollDetailNotFoundBody => t(
        'تعذر العثور على هذه القسيمة. اسحب للتحديث في شاشة الرواتب.',
        'This payslip could not be found. Pull to refresh on the payroll screen.',
      );
  String get payrollEarningsTitle => t('الاستحقاقات', 'Earnings');
  String get payrollDeductionsTitle => t('الخصومات', 'Deductions');
  String get payrollGross => t('إجمالي الراتب', 'Gross pay');
  String get payrollPaymentTitle => t('الدفع', 'Payment');

  String get requestsTabLeave => t('الإجازات', 'Leave');
  String get requestsTabCorrespondence => t('المراسلات', 'Correspondence');
  String get loginForgotPassword => t('نسيت كلمة المرور؟', 'Forgot password?');
  String get forgotPasswordTitle => t('استعادة كلمة المرور', 'Forgot password');
  String get forgotPasswordSubmit => t('إرسال رمز التحقق', 'Send verification code');
  String get forgotPasswordFailed =>
      t('تعذّر إرسال الطلب.', 'Could not send the request.');
  String get resetOtpTitle => t('أدخل رمز التحقق', 'Enter verification code');
  String get resetOtpSubtitle => t(
        'أرسلنا رمزاً مكوّناً من 6 أرقام إلى بريدك. صالح لمدة 10 دقائق.',
        'We sent a 6-digit code to your email. It expires in 10 minutes.',
      );
  String get resetOtpCodeLabel => t('رمز التحقق', 'Verification code');
  String get resetOtpSubmit => t('تحقق من الرمز', 'Verify code');
  String get resetOtpInvalid =>
      t('الرمز غير صالح أو منتهٍ.', 'Invalid or expired code.');
  String get resetNewPasswordTitle =>
      t('إعادة تعيين كلمة المرور', 'Set a new password');
  String get resetNewPasswordLabel =>
      t('كلمة المرور الجديدة', 'New password');
  String get resetConfirmPasswordLabel =>
      t('تأكيد كلمة المرور', 'Confirm password');
  String get resetNewPasswordSubmit =>
      t('حفظ كلمة المرور', 'Save password');
  String get resetNewPasswordSuccess =>
      t('تم تحديث كلمة المرور.', 'Password updated.');
  String get resetNewPasswordFailed =>
      t('تعذّر تحديث كلمة المرور.', 'Could not update password.');
  String get requiredPasswordTitle => t('تغيير كلمة المرور', 'Change password');
  String get requiredPasswordSubtitle => t(
        'يجب اختيار كلمة مرور جديدة قبل متابعة استخدام التطبيق.',
        'You must choose a new password before continuing.',
      );
  String get requiredPasswordSubmit => t('حفظ كلمة المرور', 'Save password');
  String get requiredPasswordTooShort =>
      t('8 أحرف على الأقل', 'At least 8 characters');
  String get twoFactorTitle => t('التحقق بخطوتين', 'Two-step verification');
  String get twoFactorSubtitle => t(
        'أدخل الرمز المكوّن من 6 أرقام المرسل إلى بريدك.',
        'Enter the 6-digit code sent to your email.',
      );
  String get twoFactorCodeLabel => t('رمز التحقق', 'Verification code');
  String get twoFactorSubmit => t('تأكيد', 'Verify');
  String get twoFactorInvalid => t('رمز غير صالح', 'Invalid code');
  String get profilePreferredLanguage => t('اللغة المفضلة', 'Preferred language');
  String get profileTwoFactorTitle => t('المصادقة الثنائية', 'Two-factor auth');
  String get profileTwoFactorEnable => t('تفعيل المصادقة الثنائية', 'Enable 2FA');
  String get profileTwoFactorPasswordHint =>
      t('أدخل كلمة المرور الحالية أعلاه', 'Enter your current password above');
  String get profileTwoFactorEnabled =>
      t('تم تفعيل المصادقة الثنائية', '2FA enabled');
  String get profileTwoFactorDisabled =>
      t('تم تعطيل المصادقة الثنائية', '2FA disabled');
  String get profileTwoFactorFailed =>
      t('تعذّر تحديث المصادقة الثنائية', 'Could not update 2FA');
  String get profilePasswordUpdated =>
      t('تم تحديث كلمة المرور', 'Password updated');
  String get correspondenceNewTitle => t('مراسلة جديدة', 'New message');
  String get correspondenceSubject => t('الموضوع', 'Subject');
  String get correspondenceMessage => t('النص', 'Message');
  String get correspondenceTargetRole => t('الجهة المستهدفة', 'Target');
  String get correspondenceSend => t('إرسال', 'Send');
  String get correspondenceSent => t('تم إرسال المراسلة', 'Message sent');
  String get correspondenceEmpty =>
      t('لا توجد مراسلات', 'No correspondence yet');
  String get correspondenceReply => t('رد', 'Reply');

  String get leaveFormTitle => t('طلب إجازة', 'Leave request');
  String get leaveTypeLabel => t('نوع الإجازة', 'Leave type');
  String get leaveTypeVacation => t('إجازة سنوية', 'Annual leave');
  String get leaveTypeSick => t('إجازة مرضية', 'Sick leave');
  String get leaveTypePersonal => t('إجازة شخصية', 'Personal leave');
  String get leaveStartDate => t('تاريخ البداية', 'Start date');
  String get leaveEndDate => t('تاريخ النهاية', 'End date');
  String get leaveReasonLabel => t('السبب (اختياري)', 'Reason (optional)');
  String get leaveReasonHint =>
      t('اذكر سبب الطلب', 'Brief reason for your request');
  String get leaveSubmitButton => t('إرسال الطلب', 'Submit request');
  String get leaveSubmitSuccess =>
      t('تم إرسال طلب الإجازة', 'Leave request submitted');
  String get leavePendingLimitMessage => t(
        'لديك طلبان إجازة قيد المراجعة. انتظر حتى تتم مراجعتهما من الموارد البشرية.',
        'You have two leave requests awaiting HR review. Please wait until they are reviewed.',
      );
  String get leaveDatesRequired =>
      t('اختر تاريخ البداية والنهاية', 'Select start and end dates');
  String get leaveBalanceCardTitle =>
      t('رصيد الإجازة السنوية', 'Annual leave balance');
  String get leaveEntitlement => t('الاستحقاق', 'Entitlement');
  String get leaveUsed => t('المستخدم', 'Used');
  String get leaveRemaining => t('المتبقي', 'Remaining');
  String get leaveHistoryTitle => t('سجل الإجازات', 'Leave history');
  String get leaveFilterAll => t('كل الحالات', 'All statuses');
  String get leaveHistoryEmpty =>
      t('لا توجد طلبات إجازة بعد', 'No leave requests yet');
  String get leaveStatusPending => t('قيد الانتظار', 'Pending');
  String get leaveStatusApproved => t('موافق عليه', 'Approved');
  String get leaveStatusRejected => t('مرفوض', 'Rejected');
  String leaveReviewNotes(String notes) =>
      t('ملاحظة المراجع: $notes', 'Reviewer note: $notes');

  String get feedbackFormTitle => t('ملاحظة للموارد البشرية', 'HR feedback');
  String get feedbackCategoryLabel => t('التصنيف', 'Category');
  String get feedbackCategoryIssue => t('مشكلة', 'Issue');
  String get feedbackCategorySuggestion => t('اقتراح', 'Suggestion');
  String get feedbackCategoryQuestion => t('سؤال', 'Question');
  String get feedbackMessageLabel => t('الرسالة', 'Message');
  String get feedbackMessageHint => t(
        'اكتب ملاحظتك أو مشكلتك هنا',
        'Write your note or issue here',
      );
  String get feedbackSubmitButton => t('إرسال', 'Submit');
  String get feedbackSubmitSuccess =>
      t('تم إرسال ملاحظتك', 'Feedback submitted');
  String get feedbackMessageTooShort => t(
        'الرسالة قصيرة جداً (3 أحرف على الأقل)',
        'Message is too short (at least 3 characters)',
      );
  String get feedbackHistoryTitle => t('ملاحظات سابقة', 'Previous feedback');
  String get feedbackHistoryEmpty =>
      t('لا توجد ملاحظات سابقة', 'No previous feedback');
  String get feedbackPendingLimitMessage => t(
        'لديك ملاحظتان قيد المراجعة. انتظر حتى تتم مراجعتهما من الموارد البشرية.',
        'You have two HR notes awaiting review. Please wait until they are reviewed.',
      );

  String get notificationsTitle => t('الإشعارات', 'Notifications');
  String get notificationsMarkAllRead =>
      t('تعليم الكل كمقروء', 'Mark all read');
  String get notificationsMarkRead => t('تعليم كمقروء', 'Mark read');
  String get notificationsClearRead =>
      t('مسح المقروءة', 'Clear read');
  String get notificationsUnreadBadge => t('جديد', 'New');
  String get notificationsEmptyTitle =>
      t('لا توجد إشعارات', 'No notifications');
  String get notificationsEmptyBody => t(
        'ستظهر الإشعارات هنا عند إرسالها.',
        'Notifications will appear here when sent.',
      );

  String get profileSettingsTitle => t('الإعدادات', 'Settings');
  String get profileLanguageActive => t('مفعّل', 'Active');
  String get profileLanguageTap => t('اضغط للتبديل', 'Tap to switch');
  String profileEmployeeId(int id) =>
      t('رقم الموظف: $id', 'Employee ID: $id');
  String get digitalBadgeTitle => t('البطاقة الرقمية', 'Digital badge');
  String get digitalBadgeHint => t(
        'يعمل بدون اتصال بعد تحميل الملف.',
        'Works offline after profile is loaded.',
      );
  String get profileAvatarFromGallery =>
      t('من المعرض', 'From gallery');
  String get profileAvatarFromCamera =>
      t('من الكاميرا', 'From camera');
  String get profileAvatarUploadSuccess =>
      t('تم تحديث الصورة', 'Photo updated');
  String get profileAvatarUploadFailed =>
      t('تعذّر رفع الصورة', 'Could not upload photo');
  String get profileAvatarTapHint =>
      t('اضغط لتغيير الصورة', 'Tap to change photo');

  String get stockBranchLabel => t('الفرع', 'Branch');
  String get stockSearchHint => t(
        'اسم المنتج، SKU، أو الباركود',
        'Product name, SKU, or barcode',
      );
  String get stockSearchButton => t('بحث', 'Search');
  String get stockScanButton => t('مسح', 'Scan');
  String get stockScanTitle => t('مسح الباركود', 'Scan barcode');
  String get stockScanHint => t(
        'وجّه الكاميرا نحو باركود المنتج',
        'Point the camera at the product barcode',
      );
  String get stockIdleTitle => t('مستكشف المخزون', 'Stock finder');
  String get stockIdleBody => t(
        'ابحث بالاسم أو SKU أو امسح الباركود لمعرفة الكميات في الفروع.',
        'Search by name or SKU, or scan a barcode to see quantities by branch.',
      );
  String get stockNotFoundTitle => t('لا توجد نتائج', 'No matches');
  String get stockNotFoundBody => t(
        'جرّب اسماً أو رمزاً مختلفاً.',
        'Try a different name or code.',
      );
  String get stockNoStockTitle => t('لا مخزون', 'No stock');
  String get stockNoStockBody => t(
        'المنتج موجود لكن لا كميات متاحة في أي فرع.',
        'Product found but no available quantity at any branch.',
      );
  String get stockPickVariantTitle =>
      t('اختر المنتج', 'Choose a product');
  String get stockBackToResults => t('كل النتائج', 'All results');
  String get stockCurrentBranchTitle =>
      t('فرعك الحالي', 'Your branch');
  String get stockOtherBranchesTitle =>
      t('فروع أخرى', 'Other branches');
  String get stockBarcodeLabel => t('الباركود', 'Barcode');
  String get stockOnHand => t('في المخزن', 'On hand');
  String get stockReserved => t('محجوز', 'Reserved');
  String get stockDamaged => t('تالف', 'Damaged');
  String get stockInTransit => t('قيد النقل', 'In transit');
  String stockAvailableQty(int qty) =>
      t('متاح: $qty', 'Available: $qty');
}
