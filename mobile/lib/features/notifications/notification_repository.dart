import '../../../core/api/api_client.dart';
import 'models/notification_delivery.dart';

class NotificationRepository {
  NotificationRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Future<int> getUnreadCount() async {
    final data = await _api.getMap('/notifications/deliveries/me/unread-count');
    return data['unread_count'] as int? ?? 0;
  }

  Future<List<NotificationDeliveryRead>> getMyDeliveries({
    int limit = 50,
    bool unreadOnly = false,
  }) async {
    final data = await _api.getMap(
      '/notifications/deliveries/me',
      queryParameters: {
        'limit': limit,
        if (unreadOnly) 'unread_only': true,
      },
    );
    final items = data['items'];
    if (items is! List) return const [];
    return items
        .whereType<Map<String, dynamic>>()
        .map(NotificationDeliveryRead.fromJson)
        .toList();
  }

  Future<NotificationDeliveryRead> markAsRead(int deliveryId) async {
    final data = await _api.patch<Map<String, dynamic>>(
      '/notifications/deliveries/$deliveryId/read',
    );
    return NotificationDeliveryRead.fromJson(data);
  }

  Future<int> markAllAsRead() async {
    final data = await _api.postMap('/notifications/deliveries/me/read-all');
    return data['updated'] as int? ?? 0;
  }

  Future<void> clearReadDeliveries() async {
    await _api.deleteVoid('/notifications/deliveries/me/read');
  }
}
