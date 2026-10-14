package netscape.javascript;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.AccessController;
import java.security.PrivilegedAction;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A document whose cookie member behaves like document.cookie in a browser.
 * Cookies persist to ~/saves/cookies.txt, one name=value pair per line.
 */
class Document extends JSObject {
    private final File file = AccessController.doPrivileged(
            (PrivilegedAction<File>) () -> new File(System.getProperty("user.home"), "saves/cookies.txt"));
    private final Map<String, String> cookies = new LinkedHashMap<String, String>();

    Document() {
        for (String line : AccessController.doPrivileged((PrivilegedAction<List<String>>) this::read)) {
            put(line);
        }
    }

    @Override
    public Object getMember(String name) throws JSException {
        if (!name.equals("cookie")) {
            return super.getMember(name);
        }
        return String.join("; ", lines());
    }

    @Override
    public void setMember(String name, Object value) throws JSException {
        if (!name.equals("cookie")) {
            super.setMember(name, value);
            return;
        }
        if (put(String.valueOf(value).split(";", 2)[0])) {
            AccessController.doPrivileged((PrivilegedAction<Void>) this::write);
        }
    }

    private boolean put(String pair) {
        int eq = pair.indexOf('=');
        if (eq <= 0) {
            return false;
        }
        cookies.put(pair.substring(0, eq).trim(), pair.substring(eq + 1).trim());
        return true;
    }

    private List<String> lines() {
        List<String> lines = new ArrayList<String>();
        for (Map.Entry<String, String> cookie : cookies.entrySet()) {
            lines.add(cookie.getKey() + "=" + cookie.getValue());
        }
        return lines;
    }

    private List<String> read() {
        try {
            return file.isFile() ? Files.readAllLines(file.toPath(), StandardCharsets.UTF_8) : new ArrayList<String>();
        } catch (IOException e) {
            System.err.println("Failed to read " + file + ": " + e);
            return new ArrayList<String>();
        }
    }

    private Void write() {
        try {
            file.getParentFile().mkdirs();
            Files.write(file.toPath(), lines(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            System.err.println("Failed to write " + file + ": " + e);
        }
        return null;
    }
}
