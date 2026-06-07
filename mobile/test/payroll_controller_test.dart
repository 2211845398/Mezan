import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/api/api_client.dart';
import 'package:mobile/core/api/token_storage.dart';
import 'package:mobile/features/payroll/models/payslip_read.dart';
import 'package:mobile/features/payroll/payroll_controller.dart';
import 'package:mobile/features/payroll/payroll_repository.dart';

void main() {
  test('isEmployeeVisible hides draft payslips', () {
    const draft = PayslipRead(
      id: 1,
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
      netAmount: '0',
      grossAmount: '0',
      deductions: '0',
      status: 'draft',
      displayStatus: 'draft',
    );
    const approved = PayslipRead(
      id: 2,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      netAmount: '100',
      grossAmount: '100',
      deductions: '0',
      status: 'approved',
      displayStatus: 'approved',
    );
    const paid = PayslipRead(
      id: 3,
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      netAmount: '100',
      grossAmount: '100',
      deductions: '0',
      status: 'approved',
      displayStatus: 'paid',
      paidAt: '2026-03-28T10:00:00Z',
    );

    expect(draft.isEmployeeVisible, isFalse);
    expect(approved.isEmployeeVisible, isTrue);
    expect(paid.isEmployeeVisible, isTrue);
  });

  test('currentMonthPayslip prefers current calendar month', () {
    final now = DateTime.now();
    final controller = PayrollController(
      repository: PayrollRepository(
        apiClient: ApiClient(tokenStorage: TokenStorage()),
      ),
    );
    controller.payslips = [
      PayslipRead(
        id: 1,
        periodStart: '${now.year}-${now.month.toString().padLeft(2, '0')}-01',
        periodEnd: '${now.year}-${now.month.toString().padLeft(2, '0')}-28',
        netAmount: '100',
        grossAmount: '100',
        deductions: '0',
        status: 'paid',
        displayStatus: 'paid',
      ),
      PayslipRead(
        id: 2,
        periodStart: '2020-01-01',
        periodEnd: '2020-01-31',
        netAmount: '50',
        grossAmount: '50',
        deductions: '0',
        status: 'paid',
        displayStatus: 'paid',
      ),
    ];
    expect(controller.currentMonthPayslip?.id, 1);
  });

  test('payslipById returns matching payslip', () {
    final controller = PayrollController(
      repository: PayrollRepository(
        apiClient: ApiClient(tokenStorage: TokenStorage()),
      ),
    );
    controller.payslips = [
      PayslipRead(
        id: 7,
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        netAmount: '100',
        grossAmount: '100',
        deductions: '0',
        status: 'approved',
        displayStatus: 'approved',
      ),
    ];
    expect(controller.payslipById(7)?.id, 7);
    expect(controller.payslipById(99), isNull);
  });
}
