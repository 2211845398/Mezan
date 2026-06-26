import 'package:flutter/foundation.dart';

import '../../core/api/api_exception.dart';
import 'models/notification_delivery.dart';
import 'notification_repository.dart';

enum NotificationsLoadState { idle, loading, ready, error }

class NotificationsController extends ChangeNotifier {
  NotificationsController({required NotificationRepository repository})
      : _repository = repository;

  final NotificationRepository _repository;

  NotificationsLoadState state = NotificationsLoadState.idle;
  String? errorMessage;
  List<NotificationDeliveryRead> items = const [];
  int unreadCount = 0;
  var _actionBusy = false;

  bool get isLoading => state == NotificationsLoadState.loading;
  bool get isBusy => _actionBusy;

  Future<void> refreshUnreadCount() async {
    try {
      unreadCount = await _repository.getUnreadCount();
      notifyListeners();
    } catch (_) {
      // Bell badge is optional when notifications permission is missing.
    }
  }

  Future<void> load() async {
    state = NotificationsLoadState.loading;
    errorMessage = null;
    notifyListeners();

    try {
      final results = await Future.wait([
        _repository.getMyDeliveries(limit: 50),
        _repository.getUnreadCount(),
      ]);
      items = results[0] as List<NotificationDeliveryRead>;
      unreadCount = results[1] as int;
      state = NotificationsLoadState.ready;
    } catch (e) {
      state = NotificationsLoadState.error;
      errorMessage = e is ApiException ? e.message : 'Network error';
    }
    notifyListeners();
  }

  Future<void> markRead(int deliveryId) async {
    _actionBusy = true;
    notifyListeners();
    try {
      final updated = await _repository.markAsRead(deliveryId);
      items = items
          .map((item) => item.id == deliveryId ? updated : item)
          .toList();
      if (unreadCount > 0) unreadCount -= 1;
    } catch (e) {
      errorMessage = e is ApiException ? e.message : 'Network error';
    } finally {
      _actionBusy = false;
      notifyListeners();
    }
  }

  Future<void> markAllRead() async {
    _actionBusy = true;
    notifyListeners();
    try {
      await _repository.markAllAsRead();
      await load();
    } catch (e) {
      errorMessage = e is ApiException ? e.message : 'Network error';
      _actionBusy = false;
      notifyListeners();
    }
  }

  Future<void> clearRead() async {
    _actionBusy = true;
    notifyListeners();
    try {
      await _repository.clearReadDeliveries();
      await load();
    } catch (e) {
      errorMessage = e is ApiException ? e.message : 'Network error';
      _actionBusy = false;
      notifyListeners();
    }
  }
}
