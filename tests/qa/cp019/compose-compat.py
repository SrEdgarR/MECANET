"""Pure, closed compatibility adapter for the external r02 QA controller.

This does not execute Compose, inspect resources, change a configuration, read
material, or authorize a resume. Root must supply its actual `compose create
--help` output and validate exact CREATED CID references before each call. The
immutable runtime artifact and its previous helpers remain unchanged.
"""
import re

SOURCE='mecanet-qa-p1l3-r02';TARGET=SOURCE+'-target'
PATHS={'/opt/'+project+'/compose.json':project for project in (SOURCE,TARGET)}
SELECTIONS=frozenset((('postgres',),('worker',),('api1','api2','web')))
PREFIX=('docker','compose','-f')
CREATE=('create','--no-build','--pull','never','--no-deps')

def require(value,code):
 if not value:raise AssertionError(code)

def valid_help(value):
 if not isinstance(value,str) or not 1<=len(value)<=65536 or any(ord(c)<32 and c not in '\n\r\t' for c in value):return False
 option=lambda name:re.search(r'(?m)^\s*(?:-[A-Za-z],\s*)?'+re.escape(name)+r'(?:\s|$)',value) is not None
 return re.search(r'(?m)^Usage:\s+docker compose create\b',value) is not None and option('--no-recreate') and not option('--no-deps')

def adapted_create(args,create_help=None,validatePrerequisites=None):
 """Return an argv tuple; only the exact legacy CREATE frame is transformed.

 Other commands pass through byte-for-byte and do not invoke a callback.
 Compose CREATE has only three existing service selections in the two approved
 roots. Alternate executable/context/project/path/flags/service sets fail closed.
 Root's callback(project, services_tuple) must return the literal True and prove:
 selected services are absent; all dependencies already exist under their exact
 Root-created CID references; expected limits/mounts/networks still match; no
 unplanned dependency or network can be created. For the initial postgres
 CREATE, Root validates the planned own internal networks, names and IPAM
 against the pinned Compose hash and fresh no-overlap checks. For worker/API,
 dependencies already exist under exact Root CID references. Shared resources
 are excluded; the existing cold/resource gates still apply. Labels or `--no-recreate` alone are insufficient.
 This function never chooses, adopts or starts a CID and never retries a command.
 """
 require(isinstance(args,(tuple,list)) and args and all(isinstance(a,str) and a and '\x00' not in a for a in args),'COMPOSE_ARGV_REQUIRED');argv=tuple(args)
 candidate='create' in argv and ('compose' in argv or argv[0]=='docker-compose')
 if not candidate:return argv
 require(len(argv)>=10 and argv[:3]==PREFIX and argv[3] in PATHS and argv[4:9]==CREATE,'COMPOSE_CREATE_FRAME')
 services=argv[9:];require(services in SELECTIONS,'COMPOSE_CREATE_SERVICES')
 require(valid_help(create_help),'COMPOSE_CREATE_CAPABILITY')
 require(callable(validatePrerequisites),'COMPOSE_PREREQUISITES_REQUIRED')
 try:approved=validatePrerequisites(PATHS[argv[3]],services)
 except BaseException:raise AssertionError('COMPOSE_PREREQUISITES_UNVERIFIED') from None
 require(approved is True,'COMPOSE_PREREQUISITES_UNVERIFIED')
 return argv[:8]+('--no-recreate',)+services
