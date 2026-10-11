package netscape.javascript;

import java.util.LinkedHashMap;
import java.util.Map;

/** A document whose cookie member behaves like document.cookie in a browser. */
class Document extends JSObject {
    private final Map<String, String> cookies = new LinkedHashMap<String, String>();

    @Override
    public Object getMember(String name) throws JSException {
        if (!name.equals("cookie")) {
            return super.getMember(name);
        }
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> cookie : cookies.entrySet()) {
            if (sb.length() > 0) {
                sb.append("; ");
            }
            sb.append(cookie.getKey()).append('=').append(cookie.getValue());
        }
        return sb.toString();
    }

    @Override
    public void setMember(String name, Object value) throws JSException {
        if (!name.equals("cookie")) {
            super.setMember(name, value);
            return;
        }
        String pair = String.valueOf(value).split(";", 2)[0];
        int eq = pair.indexOf('=');
        if (eq > 0) {
            cookies.put(pair.substring(0, eq).trim(), pair.substring(eq + 1).trim());
        }
    }
}
