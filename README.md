# wspbserver

**W**eb**S**ocket**P**roto**B**uf**S**erver: managing client-group connections, passing messages between clients.

wspbserver is basically a 'chatroom' server for websocket/protobuf applications.

The Client-Group protocol (CgProto) has commands to Join, Leave, Send & Ack/Nak.

client apps join a group, get a client_id (~ the socket-id) and can then post messages to the group, and recieve copies of messages that other clients send. Messages are 'flow-controlled' by requiring an ACK from each client before proceeding to the next message, so clients stay synch'd.

**Send** forwards the payload (bytearray, presumably a protobuf for an inner protocol) to the Referee, and if the Referee ACKs it, then to the other members of the group (including the sender, unless nocc == true). The CgMessage contains other 'envelope' and message status info.

Each Group gets an implicit "group moderator" (or Referee) that ACK's all requests. This is replaced by an actual Referee app when such an app joins and declares itself to be the Referee. Such a Referee can enforce game rules & validate common state among clients.

