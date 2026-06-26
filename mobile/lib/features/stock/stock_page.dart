import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/i18n/app_strings.dart';
import '../../core/theme/mezan_theme.dart';
import '../../shared/widgets/mezan_badge.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_empty_state.dart';
import '../../shared/widgets/mezan_error_state.dart';
import '../../shared/widgets/mezan_loading_state.dart';
import '../../shared/widgets/mezan_number_text.dart';
import '../../shared/widgets/mezan_text_field.dart';
import '../auth/auth_session.dart';
import 'models/stock_finder_result.dart';
import 'stock_barcode_scan_page.dart';
import 'stock_controller.dart';

class StockPage extends StatefulWidget {
  const StockPage({super.key});

  @override
  State<StockPage> createState() => _StockPageState();
}

class _StockPageState extends State<StockPage> {
  final _queryController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final session = context.read<AuthSession>();
      context.read<StockController>().loadBranches(
            defaultBranchId: session.branch?.id,
          );
    });
  }

  @override
  void dispose() {
    _queryController.dispose();
    super.dispose();
  }

  Future<void> _runSearch() async {
    final controller = context.read<StockController>();
    await controller.search(
      _queryController.text,
      branchId: controller.selectedBranchId,
    );
  }

  Future<void> _selectSuggestion(StockFinderResult result) async {
    _queryController.text = result.productName;
    final controller = context.read<StockController>();
    controller.clearSuggestions();
    if (result.productName.trim().isNotEmpty) {
      await controller.search(
        result.productName,
        branchId: controller.selectedBranchId,
      );
      if (controller.results.length == 1) {
        controller.selectResult(controller.results.first);
      } else if (controller.results.any((r) => r.variantId == result.variantId)) {
        controller.selectResult(
          controller.results.firstWhere((r) => r.variantId == result.variantId),
        );
      }
    }
  }

  Future<void> _openScanner() async {
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const StockBarcodeScanPage()),
    );
    if (code == null || code.isEmpty || !mounted) return;
    _queryController.text = code;
    await _runSearch();
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final controller = context.watch<StockController>();
    final ext = MezanThemeExtension.of(context);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        MezanCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (controller.branches.isNotEmpty) ...[
                DropdownButtonFormField<int>(
                  initialValue: controller.selectedBranchId,
                  decoration: InputDecoration(
                    labelText: strings.stockBranchLabel,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  items: controller.branches
                      .map(
                        (b) => DropdownMenuItem(
                          value: b.id,
                          child: Text(b.name),
                        ),
                      )
                      .toList(),
                  onChanged: controller.isLoading
                      ? null
                      : (id) {
                          if (id == null) return;
                          controller.setSelectedBranch(id);
                        },
                ),
                const SizedBox(height: 12),
              ],
              MezanTextField(
                controller: _queryController,
                hint: strings.stockSearchHint,
                textInputAction: TextInputAction.search,
                onChanged: controller.onQueryChanged,
                onSubmitted: (_) => _runSearch(),
              ),
              if (controller.isSuggesting) ...[
                const SizedBox(height: 8),
                const LinearProgressIndicator(minHeight: 2),
              ],
              if (controller.suggestions.isNotEmpty) ...[
                const SizedBox(height: 8),
                Material(
                  elevation: 1,
                  borderRadius: BorderRadius.circular(8),
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: controller.suggestions.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final item = controller.suggestions[index];
                      return ListTile(
                        dense: true,
                        title: Text(item.productName),
                        subtitle: item.variantName != item.productName
                            ? Text(item.variantName)
                            : MezanNumberText(
                                item.displaySku,
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(color: ext.mutedForeground),
                              ),
                        onTap: () => _selectSuggestion(item),
                      );
                    },
                  ),
                ),
              ],
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: MezanButton(
                      label: strings.stockSearchButton,
                      expand: true,
                      onPressed: controller.isLoading ? null : _runSearch,
                    ),
                  ),
                  const SizedBox(width: 8),
                  MezanButton(
                    label: strings.stockScanButton,
                    variant: MezanButtonVariant.outline,
                    icon: Icons.qr_code_scanner,
                    onPressed: controller.isLoading ? null : _openScanner,
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (controller.isLoading)
          const MezanLoadingState()
        else if (controller.state == StockSearchState.error)
          MezanErrorState(
            message: controller.errorMessage ?? strings.errorNetwork,
            onRetry: _runSearch,
          )
        else if (controller.state == StockSearchState.empty)
          MezanEmptyState(
            title: strings.stockNotFoundTitle,
            message: strings.stockNotFoundBody,
            icon: Icons.search_off_outlined,
          )
        else if (controller.state == StockSearchState.ready &&
            controller.selected == null &&
            controller.results.length > 1)
          _VariantPicker(
            results: controller.results,
            strings: strings,
            onSelect: controller.selectResult,
          )
        else if (controller.selected != null)
          _StockDetail(
            result: controller.selected!,
            strings: strings,
            ext: ext,
            onBack: controller.results.length > 1
                ? controller.clearSelection
                : null,
          )
        else if (controller.state == StockSearchState.idle)
          MezanEmptyState(
            title: strings.stockIdleTitle,
            message: strings.stockIdleBody,
            icon: Icons.inventory_2_outlined,
          ),
      ],
    );
  }
}

class _VariantPicker extends StatelessWidget {
  const _VariantPicker({
    required this.results,
    required this.strings,
    required this.onSelect,
  });

  final List<StockFinderResult> results;
  final AppStrings strings;
  final void Function(StockFinderResult) onSelect;

  @override
  Widget build(BuildContext context) {
    final ext = MezanThemeExtension.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          strings.stockPickVariantTitle,
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: 8),
        ...results.map((r) {
          final avail = r.currentBranch?.available ?? 0;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: MezanCard(
              onTap: () => onSelect(r),
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(r.productName),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (r.variantName != r.productName)
                      Text(r.variantName),
                    MezanNumberText(
                      r.displaySku,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: ext.mutedForeground,
                          ),
                    ),
                  ],
                ),
                trailing: MezanBadge(
                  label: strings.stockAvailableQty(avail),
                  variant: avail > 0
                      ? MezanBadgeVariant.secondary
                      : MezanBadgeVariant.muted,
                ),
              ),
            ),
          );
        }),
      ],
    );
  }
}

class _StockDetail extends StatelessWidget {
  const _StockDetail({
    required this.result,
    required this.strings,
    required this.ext,
    this.onBack,
  });

  final StockFinderResult result;
  final AppStrings strings;
  final MezanThemeExtension ext;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (onBack != null) ...[
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              onPressed: onBack,
              icon: const Icon(Icons.arrow_back),
              label: Text(strings.stockBackToResults),
            ),
          ),
          const SizedBox(height: 4),
        ],
        MezanCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                result.productName,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if (result.variantName.isNotEmpty &&
                  result.variantName != result.productName) ...[
                const SizedBox(height: 4),
                Text(result.variantName),
              ],
              const SizedBox(height: 8),
              MezanNumberText(
                result.displaySku,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: ext.mutedForeground,
                    ),
              ),
              if (result.barcode.isNotEmpty) ...[
                const SizedBox(height: 4),
                MezanNumberText(
                  '${strings.stockBarcodeLabel}: ${result.barcode}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: ext.mutedForeground,
                      ),
                ),
              ],
            ],
          ),
        ),
        if (!result.hasAnyStock) ...[
          const SizedBox(height: 12),
          MezanEmptyState(
            title: strings.stockNoStockTitle,
            message: strings.stockNoStockBody,
            icon: Icons.inventory_outlined,
          ),
        ],
        if (result.currentBranch != null) ...[
          const SizedBox(height: 12),
          Text(
            strings.stockCurrentBranchTitle,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  color: scheme.secondary,
                ),
          ),
          const SizedBox(height: 8),
          _BranchQtyCard(
            branch: result.currentBranch!,
            strings: strings,
            ext: ext,
            highlight: true,
          ),
        ],
        if (result.otherBranches.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text(
            strings.stockOtherBranchesTitle,
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          ...result.otherBranches.map(
            (b) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _BranchQtyCard(
                branch: b,
                strings: strings,
                ext: ext,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _BranchQtyCard extends StatelessWidget {
  const _BranchQtyCard({
    required this.branch,
    required this.strings,
    required this.ext,
    this.highlight = false,
  });

  final StockFinderBranchQty branch;
  final AppStrings strings;
  final MezanThemeExtension ext;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return MezanCard(
      radius: highlight ? MezanCardRadius.hero : MezanCardRadius.normal,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  branch.branchName,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ),
              MezanBadge(
                label: strings.stockAvailableQty(branch.available),
                variant: branch.available > 0
                    ? MezanBadgeVariant.secondary
                    : MezanBadgeVariant.muted,
              ),
            ],
          ),
          const SizedBox(height: 12),
          _QtyRow(
            label: strings.stockOnHand,
            value: branch.onHand,
            ext: ext,
          ),
          _QtyRow(
            label: strings.stockReserved,
            value: branch.reserved,
            ext: ext,
          ),
          _QtyRow(
            label: strings.stockDamaged,
            value: branch.damaged,
            ext: ext,
          ),
          if (branch.inTransitIn > 0)
            _QtyRow(
              label: strings.stockInTransit,
              value: branch.inTransitIn,
              ext: ext,
            ),
        ],
      ),
    );
  }
}

class _QtyRow extends StatelessWidget {
  const _QtyRow({
    required this.label,
    required this.value,
    required this.ext,
  });

  final String label;
  final int value;
  final MezanThemeExtension ext;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: ext.mutedForeground,
                ),
          ),
          MezanNumberText(
            '$value',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }
}
