import { CgServerDriver, srvrOpts, wssServer } from '.';

wssServer(true, 'cgserver', srvrOpts('game7', '8444'), CgServerDriver)