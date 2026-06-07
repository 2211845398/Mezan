import 'package:flutter/foundation.dart';

import '../../core/api/api_exception.dart';
import 'models/payslip_read.dart';
import 'payroll_repository.dart';

enum PayrollLoadState { idle, loading, ready, error }

class PayrollController extends ChangeNotifier {
  PayrollController({required PayrollRepository repository})
      : _repository = repository;

  final PayrollRepository _repository;

  PayrollLoadState state = PayrollLoadState.idle;
  String? errorMessage;
  List<PayslipRead> payslips = const [];

  bool get isLoading => state == PayrollLoadState.loading;

  PayslipRead? get currentMonthPayslip {
    final now = DateTime.now();
    for (final slip in payslips) {
      if (slip.year == now.year && slip.month == now.month) {
        return slip;
      }
    }
    return payslips.isNotEmpty ? payslips.first : null;
  }

  PayslipRead? payslipById(int id) {
    for (final slip in payslips) {
      if (slip.id == id) return slip;
    }
    return null;
  }

  Future<void> load() async {
    state = PayrollLoadState.loading;
    errorMessage = null;
    notifyListeners();

    try {
      final response = await _repository.getMyPayslips(limit: 24);
      payslips =
          response.items.where((slip) => slip.isEmployeeVisible).toList();
      state = PayrollLoadState.ready;
    } catch (e) {
      state = PayrollLoadState.error;
      errorMessage = e is ApiException ? e.message : 'Network error';
    }
    notifyListeners();
  }
}
