PROCCNT=$(shell nproc --all)
TESTPARALLELISM=10

.PHONY: default
default: banner lint build test install

.PHONY: all
all: banner lint build test install examples

.PHONY: banner
banner:
	@echo "\033[1;37m======================\033[0m"
	@echo "\033[1;37mPulumi Framework Package\033[0m"
	@echo "\033[1;37m======================\033[0m"

.PHONY: lint
lint:
	@echo "\033[0;32mLINT:\033[0m"
	@./node_modules/.bin/tslint ...

.PHONY: clean
clean:
	rm -rf ./.lumi/bin
	rm -rf ${THISLIB}

.PHONY: build
build:
	@echo "\033[0;32mBUILD:\033[0m"
	yarn link @pulumi/pulumi-fabric @pulumi/aws # ensure we link dependencies.
	yarn run build # compile the LumiPack

.PHONY: test
test:
	@echo "\033[0;32mTEST:\033[0m"
	go test ./pkg/...

.PHONY: install
install:
	@echo "\033[0;32mINSTALL:\033[0m [${LUMILIB}]"
	cp package.json bin/
	cd bin/ && yarn link # ensure NPM references resolve locally

.PHONY: examples
examples:
	@echo "\033[0;32mTEST EXAMPLES:\033[0m"
	go test -v -cover -timeout 1h -parallel ${TESTPARALLELISM} ./examples

publish:
	@echo "\033[0;32mPublishing current release:\033[0m"
	./scripts/publish.sh
.PHONY: publish
