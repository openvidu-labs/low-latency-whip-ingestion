VENDOR_DIR := vendor/openvidu-local-deployment
OPENVIDU_TAG := 3.8.0
UNAME := $(shell uname -s)

.PHONY: setup up down logs clean

setup:
	@if [ ! -d "$(VENDOR_DIR)" ]; then \
		echo "Cloning OpenVidu Local Deployment ($(OPENVIDU_TAG))..."; \
		git clone -q -b $(OPENVIDU_TAG) https://github.com/OpenVidu/openvidu-local-deployment "$(VENDOR_DIR)"; \
	else \
		echo "$(VENDOR_DIR) already present, skipping clone."; \
	fi
ifeq ($(UNAME),Darwin)
	cd $(VENDOR_DIR)/community && ./configure_lan_private_ip_macos.sh
else
	cd $(VENDOR_DIR)/community && ./configure_lan_private_ip_linux.sh
endif

up: setup
	cd $(VENDOR_DIR)/community && docker compose up -d
	docker compose up -d --build
	@echo ""
	@echo "App:     http://localhost:3000"
	@echo "OpenVidu Developer UI: http://localhost:7880"

down:
	-docker compose down
	-cd $(VENDOR_DIR)/community && docker compose down

logs:
	docker compose logs -f app

clean: down
	rm -rf vendor
