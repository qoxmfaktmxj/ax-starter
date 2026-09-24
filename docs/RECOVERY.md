# 로컬 DB와 파일 공동 복구 절차

상태: 절차 기록. 자동 백업 및 새 volume 복원 script와 실제 복구 리허설은 P1 미검증이다.

1. Web와 Worker의 신규 쓰기를 멈춘다. 같은 정지 구간에서 PostgreSQL `pg_dump`와 파일 volume archive를 만든다.
2. DB dump, 파일 archive, 생성 시각, 대상 Compose project, SHA-256 목록을 한 세트로 보관한다. 두 자료 중 하나만 골라 복원하지 않는다.
3. 원본 volume을 변경하지 않고 별도 Compose project와 새 volume을 만든다. 여기에 DB와 파일을 함께 복원한다.
4. 복원 DB의 `file_objects` 중 AVAILABLE 참조가 실제 파일과 크기, SHA-256에서 일치하는지 확인한다. DELETE_PENDING 또는 DELETED 파일이 다운로드 가능한 상태로 되살아나지 않았는지 확인한다.
5. 새 환경에서 health, 두 테스트 계정의 권한별 조회, 허용된 첨부와 출력물 다운로드를 확인한다. 확인이 끝나기 전에는 사용자를 새 환경으로 보내지 않는다.

현재 앱은 로컬 전용 파일 volume에 marker를 요구한다. 새 volume 초기화 후 archive를 복원할 때도 marker와 UID/GID 10001의 쓰기 권한을 확인해야 한다. 이 절차는 실제 NAS 또는 무중단 운영 복구 검증을 대신하지 않는다.
