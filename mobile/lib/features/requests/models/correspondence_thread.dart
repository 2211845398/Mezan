class CorrespondenceThreadRead {
  const CorrespondenceThreadRead({
    required this.id,
    required this.subject,
    required this.requestType,
    required this.status,
    required this.targetRoleCode,
    required this.updatedAt,
  });

  factory CorrespondenceThreadRead.fromJson(Map<String, dynamic> json) {
    return CorrespondenceThreadRead(
      id: json['id'] as int,
      subject: json['subject'] as String,
      requestType: json['request_type'] as String,
      status: json['status'] as String,
      targetRoleCode: json['target_role_code'] as String,
      updatedAt: json['updated_at'] as String,
    );
  }

  final int id;
  final String subject;
  final String requestType;
  final String status;
  final String targetRoleCode;
  final String updatedAt;
}

class CorrespondenceMessageRead {
  const CorrespondenceMessageRead({
    required this.id,
    required this.body,
    required this.senderUserId,
    required this.createdAt,
  });

  factory CorrespondenceMessageRead.fromJson(Map<String, dynamic> json) {
    return CorrespondenceMessageRead(
      id: json['id'] as int,
      body: json['body'] as String,
      senderUserId: json['sender_user_id'] as int,
      createdAt: json['created_at'] as String,
    );
  }

  final int id;
  final String body;
  final int senderUserId;
  final String createdAt;
}

class CorrespondenceThreadDetail extends CorrespondenceThreadRead {
  const CorrespondenceThreadDetail({
    required super.id,
    required super.subject,
    required super.requestType,
    required super.status,
    required super.targetRoleCode,
    required super.updatedAt,
    required this.messages,
  });

  factory CorrespondenceThreadDetail.fromJson(Map<String, dynamic> json) {
    final messages = (json['messages'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(CorrespondenceMessageRead.fromJson)
        .toList();
    return CorrespondenceThreadDetail(
      id: json['id'] as int,
      subject: json['subject'] as String,
      requestType: json['request_type'] as String,
      status: json['status'] as String,
      targetRoleCode: json['target_role_code'] as String,
      updatedAt: json['updated_at'] as String,
      messages: messages,
    );
  }

  final List<CorrespondenceMessageRead> messages;
}
