import { createContext } from "react";
import {
    CLIENT_CONFIG_DEFAULTS,
    ConfigWrapper,
    SERVER_CONFIG_DEFAULTS,
} from "@ai-agent/config";

export { ConfigWrapper } from "@ai-agent/config";

export const defaultClientConfig = CLIENT_CONFIG_DEFAULTS;
export const defaultServerConfig = SERVER_CONFIG_DEFAULTS;

export const defaultClientConfigWrapper = new ConfigWrapper({}, defaultClientConfig);
export const defaultServerConfigWrapper = new ConfigWrapper({}, defaultServerConfig);

export const ClientConfigContext = createContext<ConfigWrapper>(defaultClientConfigWrapper);
export const ServerConfigContext = createContext<ConfigWrapper>(defaultServerConfigWrapper);
