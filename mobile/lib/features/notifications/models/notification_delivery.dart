class NotificationDeliveryRead {
  const NotificationDeliveryRead({
    required this.id,
    required this.title,
    required this.body,
    required this.createdAt,
    this.sentAt,
    this.readAt,
    this.templateKind,
  });

  factory NotificationDeliveryRead.fromJson(Map<String, dynamic> json) {
    return NotificationDeliveryRead(
      id: json['id'] as int,
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      createdAt: json['created_at'] as String,
      sentAt: json['sent_at'] as String?,
      readAt: json['read_at'] as String?,
      templateKind: json['template_kind'] as String?,
    );
  }

  final int id;
  final String title;
  final String body;
  final String createdAt;
  final String? sentAt;
  final String? readAt;
  final String? templateKind;

  bool get isUnread => readAt == null;

  DateTime get displayTime {
    final raw = sentAt ?? createdAt;
    return DateTime.parse(raw).toLocal();
  }
}
